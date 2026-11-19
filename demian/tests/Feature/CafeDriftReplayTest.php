<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeDriftReplayVerifier;
use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\RewardCampaignService;
use App\Services\Arcade\WeeklyAwardFinalizationService;
use App\Services\Arcade\WeeklyCompetitionService;
use App\Services\Arcade\RankedGameCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class CafeDriftReplayTest extends TestCase
{
    use RefreshDatabase;

    private function fixtures(int ...$seeds): array
    {
        $process = new Process(['node', base_path('tools/generate_drift_replay_fixtures.mjs'), ...array_map('strval', $seeds)]);
        $process->mustRun();
        return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    }

    private function player(): array
    {
        return $this->withHeaders(['Authorization' => ''])->postJson('/api/v1/arcade/players',
            ['display_name' => 'Drift Player'])->assertCreated()->json();
    }

    private function start(array $player, ?string $requestId = null): array
    {
        return $this->withToken($player['token'])->postJson('/api/v1/arcade/turn-runs', [
            'game_id' => 'cafe-drift', 'rules_version' => CafeDriftReplayVerifier::VERSION,
            'request_id' => $requestId ?? (string) Str::uuid(),
        ])->assertCreated()->json();
    }

    public function test_authoritative_replay_matches_real_browser_rules_for_distinct_inputs_and_weeks(): void
    {
        $verifier = app(CafeDriftReplayVerifier::class);
        $this->assertSame(4095, $verifier->seedAt(CarbonImmutable::parse('2026-11-20T20:29:59Z')));
        $this->assertSame(4096, $verifier->seedAt(CarbonImmutable::parse('2026-11-20T20:30:00Z')));
        $cases = $this->fixtures();
        $this->assertCount(32, $cases);
        foreach ($cases as $case) {
            $this->assertSame($case['expected'], $verifier->verify($case['seed'], $case['ticks'], $case['frames']),
                $case['seed'].' / '.$case['pattern']);
        }
        $this->assertTrue(collect($cases)->contains(fn (array $case): bool => $case['cups'] === 0));
        $this->assertTrue(collect($cases)->contains(fn (array $case): bool => $case['cups'] > 0));
        $this->assertTrue(collect($cases)->contains(fn (array $case): bool => $case['nearMisses'] > 0 && $case['beans'] > 0));
    }

    public function test_accepted_score_is_server_computed_and_retries_are_atomic_and_immutable(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $player = $this->player();
        $request = (string) Str::uuid();
        $run = $this->start($player, $request);
        $this->assertSame($run['run_id'], $this->start($player, $request)['run_id']);
        $case = $this->fixtures($run['seed'])[1];
        $body = ['ticks' => $case['ticks'], 'frames' => $case['frames']];
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $this->postJson($url, $body)->assertUnprocessable();
        $this->travel(46)->seconds();
        $this->postJson($url, $body + ['score' => 2147483647])->assertUnprocessable();
        $this->postJson($url, $body + ['seed' => 1])->assertUnprocessable();
        $this->postJson($url, $body)->assertOk()->assertJsonPath('score', $case['expected']['score'])
            ->assertJsonPath('verification', 'server-replay');
        $this->postJson($url, $body)->assertOk()->assertJsonPath('score', $case['expected']['score']);
        $body['frames'][0][1] = $body['frames'][0][1] === 0 ? 1 : 0;
        $this->postJson($url, $body)->assertConflict();
        $this->assertDatabaseCount('arcade_replays', 1);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?period=weekly')->assertOk()
            ->assertJsonPath('data.0.score', $case['expected']['score'])->assertJsonCount(1, 'data');
        $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes('cafe-drift'));
    }

    public function test_weekly_course_is_common_and_bad_or_cross_account_proofs_cannot_score(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $owner = $this->player();
        $other = $this->player();
        $run = $this->start($owner);
        $this->assertSame($run['seed'], $this->start($other)['seed']);
        $case = $this->fixtures($run['seed'])[0];
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $body = ['ticks' => $case['ticks'], 'frames' => $case['frames']];
        $this->travel(46)->seconds();
        $this->postJson($url, $body)->assertNotFound();

        $this->withToken($owner['token']);
        foreach ([
            ['ticks' => 80, 'frames' => [[0, 0], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [5, 2], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [4, 29], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [4, 2], [4, 3], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [4, 0], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [80, 1]]],
            ['ticks' => 80, 'frames' => [[0, '0'], [80, 0]]],
            ['ticks' => 80, 'frames' => array_fill(0, 677, [0, 0])],
            ['ticks' => $case['ticks'] + 1, 'frames' => [[0, 0], [$case['ticks'] + 1, 0]]],
        ] as $modified) {
            $this->postJson($url, $modified)->assertUnprocessable();
        }
        $this->travel(6)->minutes();
        $this->postJson($url, $body)->assertGone();
        $this->assertDatabaseCount('arcade_replays', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->travelTo(CarbonImmutable::parse('2026-11-28T12:00:00Z'));
        $this->assertNotSame($run['seed'], $this->start($owner)['seed']);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?period=weekly')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    private function complete(array $player, array $run, int $pattern): int
    {
        $case = $this->fixtures($run['seed'])[$pattern];
        $this->travel(46)->seconds();

        return $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
                ['ticks' => $case['ticks'], 'frames' => $case['frames']])
            ->assertOk()->json('score');
    }

    private function rewardConfig(): void
    {
        foreach (['drift_prizes_enabled', 'weekly_management_enabled', 'weekly_settlement_enabled', 'weekly_auto_awards_enabled'] as $flag) {
            config()->set('demian-arcade.'.$flag, true);
        }
        config()->set('demian-arcade.weekly_auto_award_from', '2026-11-21');
        foreach (['policy_approved', 'issue_enabled', 'campaigns_enabled', 'auto_issue_enabled', 'cafe_enabled'] as $flag) {
            config()->set('demian-coupons.'.$flag, true);
        }
        config()->set('demian-coupons.policy_version', 'verified-drift-test-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        config()->set('demian-coupons.cafe_receipt_hash_key', str_repeat('r', 48));
    }

    public function test_ranked_drift_closes_into_an_audited_campaign_coupon_and_cashier_redemption(): void
    {
        $this->rewardConfig();
        $this->travelTo(CarbonImmutable::parse('2026-11-20T12:00:00Z'));
        app(WeeklyCompetitionService::class)->ensure(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $staff = DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'drift-cashier', 'display_name' => 'Drift Test Operator',
            'password_hash' => Hash::make('Drift-testing-only!2026'), 'branch_id' => 'main-cafe',
            'role' => 'super_admin', 'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $campaigns = app(RewardCampaignService::class);
        $id = $campaigns->create($staff, 1, [
            'period_key' => 'weekly:tehran:2026-11-21', 'title' => 'Drift test weekly campaign', 'max_awards' => 2,
        ]);
        $campaigns->import($staff, 1, $id, (string) Str::uuid(),
            "DMC-11111111111111111111111111111111
DMC-22222222222222222222222222222222");
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $first = $this->player();
        $second = $this->player();
        $unranked = $this->player();
        $winnerRun = $this->start($first);
        $otherRun = $this->start($second);
        $winnerScore = $this->complete($first, $winnerRun, 1);
        $otherScore = $this->complete($second, $otherRun, 0);
        $this->assertGreaterThan($otherScore, $winnerScore);

        $live = '/api/v1/arcade/leaderboards/cafe-drift?limit=1';
        $this->getJson($live)->assertOk()->assertJsonPath('data.0.score', $winnerScore)
            ->assertJsonPath('competition.prizes', 'campaign_pending');
        $this->withToken($second['token'])->getJson('/api/v1/arcade/player/best?game_id=cafe-drift')
            ->assertOk()->assertJsonPath('best.score', $otherScore)->assertJsonPath('my_rank', 2)
            ->assertJsonPath('points_to_overtake', $winnerScore - $otherScore + 1);
        $this->withToken($unranked['token'])->getJson('/api/v1/arcade/player/best?game_id=cafe-drift')
            ->assertOk()->assertJsonPath('my_rank', null);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?week=2026-11-21')
            ->assertOk()->assertJsonPath('status', 'archive_pending')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?week=2026-11-22')->assertUnprocessable();
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?week=2026-11-28')->assertUnprocessable();

        $campaigns->transition($staff, 1, $id, 'activate');
        $this->getJson($live)->assertOk()->assertJsonPath('competition.prizes', 'campaign_active');
        $this->assertDatabaseCount('arcade_coupons', 0);

        $this->travelTo(CarbonImmutable::parse('2026-11-27T20:46:01Z'));
        $finalizer = app(WeeklyAwardFinalizationService::class);
        $this->assertSame(2, $finalizer->finalize(week: '2026-11-21')['completed'][0]['created']);
        $this->assertSame([], $finalizer->finalize(week: '2026-11-21')['completed']);
        $this->assertDatabaseCount('arcade_coupons', 2);
        $this->assertSame(['2026-12-11 20:46:01'], DB::table('arcade_coupons')->distinct()->pluck('expires_at')->all());
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?week=2026-11-21')
            ->assertOk()->assertJsonPath('status', 'finalized')
            ->assertJsonPath('data.0.score', $winnerScore)->assertJsonPath('data.1.rank', 2);
        $this->withToken($second['token'])->getJson('/api/v1/arcade/player/best?game_id=cafe-drift&week=2026-11-21')
            ->assertOk()->assertJsonPath('my_rank', 2)->assertJsonPath('best.score', $otherScore);
        $this->withToken($unranked['token'])->getJson('/api/v1/arcade/player/coupons')->assertOk()->assertJsonCount(0, 'data');
        $wallet = $this->withToken($first['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertJsonPath('data.0.game_id', 'cafe-drift')
            ->assertJsonPath('data.0.discount_percent', 30)->json('data.0');
        $redeemer = app(InCafeCouponService::class);
        $key = (string) Str::uuid();
        $paid = $redeemer->redeem($staff, $wallet['code'], 'drift-qa-receipt-01', 10000, $key);
        $this->assertSame(3000, $paid['discount_minor']);
        $redeemer->redeem($staff, $wallet['code'], 'drift-qa-receipt-01', 10000, $key);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 1);
        $this->withToken($first['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertJsonPath('data.0.status', 'redeemed')->assertJsonPath('data.0.code', null);
    }

    public function test_a_practice_only_prize_week_cannot_be_retroactively_enabled_and_production_requires_approved_terms(): void
    {
        $this->rewardConfig();
        config()->set('demian-arcade.drift_prizes_enabled', false);
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $player = $this->player();
        $run = $this->start($player);
        $this->complete($player, $run, 1);
        config()->set('demian-arcade.drift_prizes_enabled', true);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?period=weekly')
            ->assertOk()->assertJsonPath('competition.prizes', 'unavailable');
        $this->travelTo(CarbonImmutable::parse('2026-11-27T20:46:01Z'));
        $report = app(WeeklyAwardFinalizationService::class)->finalize(week: '2026-11-21');
        $this->assertSame(0, $report['completed'][0]['winners']);
        $this->assertDatabaseCount('arcade_coupons', 0);
        config()->set('app.env', 'production');
        config()->set('demian-legal.publication_approved', false);
        $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes('cafe-drift'));
    }
}
