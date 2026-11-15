<?php

namespace Tests\Stress;

use App\Services\Arcade\RewardCampaignService;
use App\Services\Arcade\WeeklyAwardFinalizationService;
use App\Services\Arcade\WeeklyCompetitionService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class WeeklyAwardConcurrentFinalizationTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_real_mysql_workers_cannot_duplicate_sealed_winners_or_stock_assignment(): void
    {
        if (DB::getDriverName() !== 'mysql' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires independent MySQL/InnoDB fork workers.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-06T12:00:00Z'));
        foreach ([
            'demian-arcade.weekly_auto_awards_enabled',
            'demian-arcade.weekly_management_enabled',
            'demian-arcade.weekly_settlement_enabled',
            'demian-coupons.auto_issue_enabled',
            'demian-coupons.issue_enabled',
            'demian-coupons.campaigns_enabled',
            'demian-coupons.cafe_enabled',
            'demian-coupons.policy_approved',
        ] as $flag) config()->set($flag, true);
        config()->set('demian-arcade.weekly_auto_award_from', '2026-11-07');
        config()->set('demian-coupons.policy_version', 'race-accepted-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        app(WeeklyCompetitionService::class)->ensure(
            CarbonImmutable::parse('2026-11-10T10:00:00Z'));
        $staff = DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'race-super-admin', 'display_name' => 'Race',
            'password_hash' => Hash::make('StrongPassword123!'),
            'branch_id' => 'main-cafe', 'role' => 'super_admin',
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $campaignService = app(RewardCampaignService::class);
        $id = $campaignService->create($staff, 1, [
            'period_key' => 'weekly:tehran:2026-11-07',
            'title' => 'Concurrent Finals', 'max_awards' => 2,
        ]);
        $campaignService->import($staff, 1, $id, (string) Str::uuid(),
            "DMC-00000000000000000000000000000001\nDMC-00000000000000000000000000000002");
        $campaignService->transition($staff, 1, $id, 'activate');
        for ($i = 0; $i < 2; $i++) {
            $player = (string) Str::uuid();
            $run = (string) Str::uuid();
            DB::table('arcade_players')->insert([
                'id' => $player, 'display_name' => 'Race Finalist',
                'token_hash' => hash('sha256', $player),
                'token_expires_at' => now()->addDays(30),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_runs')->insert([
                'id' => $run, 'player_id' => $player,
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2', 'character_slug' => 'darya',
                'seed' => 123, 'track_width' => 420, 'status' => 'verified',
                'score' => 1000 - 100 * $i, 'ticks' => 120, 'passed' => 1,
                'replay_hash' => hash('sha256', $run),
                'started_at' => '2026-11-10 10:00:00',
                'expires_at' => '2026-11-10 11:00:00',
                'completed_at' => '2026-11-10 10:05:00',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_leaderboard_entries')->insert([
                'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
                'period_key' => 'weekly:tehran:2026-11-07',
                'player_id' => $player, 'run_id' => $run,
                'score' => 1000 - 100 * $i, 'achieved_at' => '2026-11-10 10:00:00',
            ]);
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:45:01Z'));
        DB::disconnect();
        $paths = [];
        $pids = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $path = sys_get_temp_dir().'/demian-awards-'.Str::uuid().'.json';
                $paths[] = $path;
                $pid = pcntl_fork();
                if ($pid === -1) $this->fail('Unable to fork MySQL award workers.');
                if ($pid === 0) {
                    DB::disconnect();
                    try {
                        $result = app(WeeklyAwardFinalizationService::class)->finalize();
                        file_put_contents($path, json_encode($result, JSON_THROW_ON_ERROR));
                        exit(0);
                    } catch (\Throwable $error) {
                        file_put_contents($path, json_encode([
                            'type' => get_class($error), 'message' => $error->getMessage(),
                        ], JSON_THROW_ON_ERROR));
                        exit(1);
                    }
                }
                $pids[] = $pid;
            }
            foreach ($pids as $pid) {
                pcntl_waitpid($pid, $status);
                $this->assertTrue(pcntl_wifexited($status));
                $this->assertSame(0, pcntl_wexitstatus($status));
            }
            $outcomes = [];
            foreach ($paths as $path) {
                $this->assertFileExists($path);
                $outcomes[] = json_decode(file_get_contents($path),
                    true, flags: JSON_THROW_ON_ERROR);
            }
            $this->assertSame(['ok', 'ok'], array_column($outcomes, 'status'));
            $counts = array_map(static fn (array $result): int =>
                count($result['completed']), $outcomes);
            sort($counts);
            $this->assertSame([0, 1], $counts);
            DB::reconnect();
            $this->assertDatabaseCount('arcade_weekly_award_finalizations', 1);
            $this->assertDatabaseCount('arcade_weekly_winners', 2);
            $this->assertDatabaseCount('arcade_coupons', 2);
            $this->assertSame(2, DB::table('arcade_reward_inventory')
                ->where('status', 'assigned')->count());
            $this->assertSame(1, DB::table('arcade_weekly_settlement_events')
                ->where('event_type', 'automatic_awards_finalized')->count());
        } finally {
            foreach ($paths as $path) @unlink($path);
        }
    }
}
