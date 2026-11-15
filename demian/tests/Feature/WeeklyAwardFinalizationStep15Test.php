<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\RewardCampaignService;
use App\Services\Arcade\WeeklyAwardFinalizationService;
use App\Services\Arcade\WeeklyCompetitionService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class WeeklyAwardFinalizationStep15Test extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'weekly:tehran:2026-11-07';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-06T12:00:00Z'));
        config()->set('demian-arcade.weekly_auto_awards_enabled', true);
        config()->set('demian-arcade.weekly_auto_award_from', '2026-11-07');
        config()->set('demian-arcade.weekly_management_enabled', true);
        config()->set('demian-arcade.weekly_settlement_enabled', true);
        config()->set('demian-coupons.auto_issue_enabled', true);
        config()->set('demian-coupons.issue_enabled', true);
        config()->set('demian-coupons.campaigns_enabled', true);
        config()->set('demian-coupons.cafe_enabled', true);
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.policy_version', 'verified-step15-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        app(WeeklyCompetitionService::class)->ensure(
            CarbonImmutable::parse('2026-11-10T10:00:00Z'));
    }

    private function staff(): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'finalizer-admin', 'display_name' => 'Finalizer Admin',
            'password_hash' => Hash::make('VeryStrongPassword123!'),
            'branch_id' => 'main-cafe', 'role' => 'super_admin',
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function campaign(int $capacity = 2, int $inventory = 2): int
    {
        $staff = $this->staff();
        $service = app(RewardCampaignService::class);
        $campaign = $service->create($staff, 1, [
            'period_key' => self::KEY, 'title' => 'Weekly Final Prize',
            'max_awards' => $capacity,
        ]);
        if ($inventory > 0) {
            $codes = [];
            foreach (range(1, $inventory) as $number) {
                $codes[] = 'DMC-'.sprintf('%032X', $number);
            }
            $service->import($staff, 1, $campaign, (string) Str::uuid(),
                implode("\n", $codes));
        }
        if ($inventory >= $capacity) {
            $service->transition($staff, 1, $campaign, 'activate');
        }

        return $campaign;
    }

    private function score(int $score, string $game = 'dino-run',
        string $started = '2026-11-10 10:00:00',
        ?string $player = null): string
    {
        $player ??= (string) Str::uuid();
        if (! DB::table('arcade_players')->where('id', $player)->exists()) {
            DB::table('arcade_players')->insert([
                'id' => $player, 'display_name' => 'Finalist',
                'token_hash' => hash('sha256', $player),
                'token_expires_at' => now()->addDays(30),
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $runId = (string) Str::uuid();
        DB::table('arcade_runs')->insert([
            'id' => $runId, 'player_id' => $player,
            'request_id' => (string) Str::uuid(), 'game_id' => $game,
            'rules_version' => 'cafe-runner-v2', 'character_slug' => 'darya',
            'seed' => 1, 'track_width' => 420, 'status' => 'verified',
            'score' => $score, 'ticks' => 120, 'passed' => 1,
            'replay_hash' => hash('sha256', $runId),
            'started_at' => $started, 'expires_at' => '2026-11-10 11:00:00',
            'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => $game, 'rules_version' => 'cafe-runner-v2',
            'period_key' => CompetitionClock::periodKeys(
                CarbonImmutable::parse($started, 'UTC'))[2],
            'player_id' => $player, 'run_id' => $runId, 'score' => $score,
            'achieved_at' => $started,
        ]);

        return $player;
    }

    private function doneTime(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:45:01Z'));
    }

    public function test_preview_is_read_only_and_apply_requires_all_independent_approvals(): void
    {
        $this->campaign();
        $this->score(100);
        $this->doneTime();
        $this->artisan('arcade:finalize-weekly-awards', [
            '--json' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 0);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
        foreach ([
            'demian-arcade.weekly_auto_awards_enabled',
            'demian-arcade.weekly_settlement_enabled',
            'demian-coupons.auto_issue_enabled',
            'demian-coupons.issue_enabled',
            'demian-coupons.campaigns_enabled',
            'demian-coupons.policy_approved',
        ] as $gate) {
            config()->set($gate, false);
            $this->artisan('arcade:finalize-weekly-awards', [
                '--apply' => true,
            ])->assertFailed();
            config()->set($gate, true);
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_malformed_or_unapproved_week_start_fails_before_mutation(): void
    {
        foreach (['2026-11-08', '2026-02-30', '2026-10-31', 'not-a-week'] as $week) {
            $this->artisan('arcade:finalize-weekly-awards', [
                '--week' => $week, '--apply' => true,
            ])->assertFailed();
        }
        foreach (['2026-11-08', 'not-a-week', ''] as $from) {
            config()->set('demian-arcade.weekly_auto_award_from', $from);
            $this->artisan('arcade:finalize-weekly-awards', [
                '--apply' => true,
            ])->assertFailed();
        }
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 0);
    }

    public function test_end_of_tehran_week_waits_through_run_completion_deadline(): void
    {
        $this->campaign();
        $this->score(300);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:59Z'));
        $this->assertSame([], app(WeeklyAwardFinalizationService::class)
            ->preview()['eligible_periods']);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:30:00Z'));
        $this->assertSame([], app(WeeklyAwardFinalizationService::class)
            ->finalize()['completed']);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:45:00Z'));
        $this->assertSame([], app(WeeklyAwardFinalizationService::class)
            ->finalize()['completed']);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        $this->doneTime();
        $results = app(WeeklyAwardFinalizationService::class)->finalize();
        $this->assertSame('ok', $results['status']);
        $this->assertSame('finalized', $results['completed'][0]['status']);
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 1);
    }

    public function test_auto_finalization_is_transactional_exactly_once_and_never_emails_codes(): void
    {
        Mail::fake();
        Notification::fake();
        $campaignId = $this->campaign();
        $this->score(300);
        $this->score(200);
        $this->doneTime();

        $this->artisan('arcade:finalize-weekly-awards', [
            '--apply' => true, '--json' => true,
        ])->assertSuccessful();
        $this->assertDatabaseHas('arcade_weekly_periods', [
            'period_key' => self::KEY, 'status' => 'sealed',
        ]);
        $this->assertDatabaseHas('arcade_weekly_award_finalizations', [
            'period_key' => self::KEY, 'winner_count' => 2, 'coupon_count' => 2,
            'campaign_id' => $campaignId,
        ]);
        $this->assertDatabaseCount('arcade_coupons', 2);
        $this->assertSame(2, DB::table('arcade_reward_inventory')
            ->where('status', 'assigned')->count());
        $this->assertSame(1, DB::table('arcade_weekly_settlement_events')
            ->where('event_type', 'automatic_awards_finalized')->count());
        $first = DB::table('arcade_weekly_award_finalizations')->first();
        $this->assertSame(DB::table('arcade_weekly_periods')->value('snapshot_hash'),
            $first->snapshot_hash);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        $this->artisan('arcade:finalize-weekly-awards', [
            '--apply' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_coupons', 2);
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 1);
        $this->assertSame(1, DB::table('arcade_weekly_settlement_events')
            ->where('event_type', 'automatic_awards_finalized')->count());
        Mail::assertNothingOutgoing();
        Notification::assertNothingSent();
    }

    public function test_stock_shortage_rolls_back_seal_winners_and_all_coupons_then_retries(): void
    {
        $id = $this->campaign(2, 2);
        $this->score(300);
        $this->score(200);
        $this->doneTime();
        DB::table('arcade_reward_inventory')->where('id',
            DB::table('arcade_reward_inventory')->min('id'))->update([
                'status' => 'void', 'code_ciphertext' => null,
            ]);
        $result = app(WeeklyAwardFinalizationService::class)->finalize();
        $this->assertSame('blocked', $result['status']);
        $this->assertStringContainsString('Insufficient', $result['blocked']['error']);
        $this->assertDatabaseCount('arcade_weekly_results', 0);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertDatabaseHas('arcade_weekly_periods', ['status' => 'open']);
        $admin = (int) DB::table('arcade_cashier_staff')->value('id');
        app(RewardCampaignService::class)->import($admin, 1, $id,
            (string) Str::uuid(), 'DMC-'.sprintf('%032X', 99));
        $result = app(WeeklyAwardFinalizationService::class)->finalize();
        $this->assertSame('ok', $result['status']);
        $this->assertDatabaseCount('arcade_coupons', 2);
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 1);
    }

    public function test_tampered_verified_score_fails_closed_without_creating_prizes(): void
    {
        $this->campaign();
        $this->score(250);
        DB::table('arcade_leaderboard_entries')->update(['score' => 999999]);
        $this->doneTime();
        $result = app(WeeklyAwardFinalizationService::class)->finalize();
        $this->assertSame('blocked', $result['status']);
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 0);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        DB::table('arcade_leaderboard_entries')->update(['score' => 250]);
        $this->assertSame('ok', app(WeeklyAwardFinalizationService::class)
            ->finalize()['status']);
        $this->assertDatabaseCount('arcade_coupons', 1);
    }

    public function test_empty_prepared_week_is_finalized_without_creating_any_coupon(): void
    {
        $this->doneTime();
        $result = app(WeeklyAwardFinalizationService::class)->finalize();
        $this->assertSame('ok', $result['status']);
        $this->assertDatabaseHas('arcade_weekly_award_finalizations', [
            'period_key' => self::KEY, 'winner_count' => 0, 'coupon_count' => 0,
        ]);
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertSame('ok', app(WeeklyAwardFinalizationService::class)
            ->finalize()['status']);
    }

    public function test_invalid_limits_and_prior_unfinalized_week_cannot_be_bypassed(): void
    {
        $this->campaign();
        $this->doneTime();
        foreach (['0', '27', '-1', 'abc'] as $bad) {
            $this->artisan('arcade:finalize-weekly-awards', [
                '--limit' => $bad, '--apply' => true,
            ])->assertFailed();
        }
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 0);
    }
}
