<?php

namespace Tests\Stress;

use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Two independent MySQL connections seal the same ended Tehran week.
 * The technical award ledger, new comparative score snapshot and audit
 * fingerprints must commit together and exactly once.
 */
final class WeeklyFairScoringConcurrentSealTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_mysql_workers_cannot_duplicate_a_fair_snapshot_or_coupon_candidates(): void
    {
        if (DB::getDriverName() !== 'mysql' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires independent MySQL/InnoDB workers.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        for ($i = 0; $i < 3; $i++) {
            $player = (string) Str::uuid();
            $run = (string) Str::uuid();
            DB::table('arcade_players')->insert([
                'id' => $player, 'display_name' => 'Parallel Settlement',
                'token_hash' => hash('sha256', $player),
                'token_expires_at' => now()->addDays(2),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_runs')->insert([
                'id' => $run, 'player_id' => $player,
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2', 'character_slug' => 'darya',
                'seed' => 17, 'track_width' => 420, 'status' => 'verified',
                'score' => 300 - $i * 50, 'ticks' => 120, 'passed' => 1,
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
                'score' => 300 - $i * 50, 'achieved_at' => '2026-11-10 10:00:00',
            ]);
        }

        DB::disconnect();
        $paths = [];
        $pids = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $path = sys_get_temp_dir().'/demian-fair-seal-'.Str::uuid().'.json';
                $paths[] = $path;
                $pid = pcntl_fork();
                if ($pid === -1) $this->fail('Could not fork two InnoDB settlement workers.');
                if ($pid === 0) {
                    DB::disconnect();
                    try {
                        $result = app(WeeklySettlementService::class)->seal('2026-11-07');
                        file_put_contents($path, json_encode($result, JSON_THROW_ON_ERROR));
                        exit(0);
                    } catch (\Throwable $error) {
                        file_put_contents($path, json_encode([
                            'type' => get_class($error),
                            'message' => $error->getMessage(),
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
            $results = [];
            foreach ($paths as $path) {
                $this->assertFileExists($path);
                $results[] = json_decode(file_get_contents($path),
                    true, flags: JSON_THROW_ON_ERROR);
            }
            $this->assertSame(['already_sealed', 'sealed'],
                array_values(array_sort(array_column($results, 'status'))));
            DB::reconnect();
            $this->assertDatabaseCount('arcade_weekly_periods', 1);
            $this->assertDatabaseCount('arcade_weekly_results', 3);
            $this->assertDatabaseCount('arcade_weekly_winners', 3);
            $this->assertDatabaseCount('arcade_weekly_fair_policies', 1);
            $this->assertDatabaseCount('arcade_weekly_fair_game_scores', 3);
            $this->assertDatabaseCount('arcade_weekly_fair_standings', 3);
            $this->assertDatabaseCount('arcade_weekly_settlement_events', 1);
            $this->assertDatabaseCount('arcade_coupons', 0);
            $this->assertSame(64, strlen((string) DB::table('arcade_weekly_fair_policies')
                ->value('fair_snapshot_hash')));
        } finally {
            foreach ($paths as $path) @unlink($path);
        }
    }
}
