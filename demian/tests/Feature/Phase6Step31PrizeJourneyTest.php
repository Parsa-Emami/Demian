<?php

namespace Tests\Feature;

use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\RewardCampaignService;
use App\Services\Arcade\RunnerReplayVerifier;
use App\Services\Arcade\WeeklyCompetitionService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Step31: one complete disposable in-DB real API replay -> weekly prize ->
 * private coupon wallet. The campaign and legal gates are explicitly enabled
 * only in the testing process; this does not authorize live prize issuance.
 */
final class Phase6Step31PrizeJourneyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-06T12:00:00Z'));
        foreach ([
            'demian-arcade.weekly_auto_awards_enabled' => true,
            'demian-arcade.weekly_auto_award_from' => '2026-11-07',
            'demian-arcade.weekly_management_enabled' => true,
            'demian-arcade.weekly_settlement_enabled' => true,
            'demian-coupons.auto_issue_enabled' => true,
            'demian-coupons.issue_enabled' => true,
            'demian-coupons.campaigns_enabled' => true,
            'demian-coupons.cafe_enabled' => true,
            'demian-coupons.policy_approved' => true,
            'demian-coupons.policy_version' => 'step31-qa-disposable-v1',
            'demian-coupons.currency' => 'IRR',
            'demian-coupons.min_order_minor' => '1000',
            'demian-coupons.max_discount_minor' => '5000',
            'demian-coupons.valid_days' => '30',
        ] as $key => $value) config()->set($key, $value);
        app(WeeklyCompetitionService::class)->ensure(
            CarbonImmutable::parse('2026-11-10T10:00:00Z')
        );
    }

    public function test_server_replay_to_sealed_prize_private_wallet_and_idempotent_finalization(): void
    {
        Mail::fake();
        Notification::fake();
        $staff = DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'step31-admin', 'display_name' => 'QA staff',
            'password_hash' => Hash::make('DisposalOnlyStrongPassword!'),
            'branch_id' => 'main-cafe', 'role' => 'super_admin',
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $service = app(RewardCampaignService::class);
        $campaign = $service->create($staff, 1, [
            'period_key' => 'weekly:tehran:2026-11-07',
            'title' => 'Disposable QA campaign', 'max_awards' => 1,
        ]);
        $service->import($staff, 1, $campaign, (string) Str::uuid(),
            'DMC-'.sprintf('%032X', 42));
        $service->transition($staff, 1, $campaign, 'activate');

        $this->travelTo(CarbonImmutable::parse('2026-11-10T10:00:00Z'));
        $player = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'QA Prize Winner',
        ])->assertCreated()->json();
        $other = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'QA Other',
        ])->assertCreated()->json();
        $fixture = json_decode(file_get_contents(
            base_path('tests/Fixtures/runner-replays.json')
        ), true, flags: JSON_THROW_ON_ERROR)[2];
        $run = $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/runs', [
                'request_id' => (string) Str::uuid(),
                'game_id' => 'dino-run',
                'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'],
                'character_slug' => 'darya', 'track_width' => $fixture['width'],
            ])->assertCreated()->json();
        DB::table('arcade_runs')->where('id', $run['run_id'])->update([
            'seed' => $fixture['seed'],
            'started_at' => now()->subSeconds(35),
        ]);
        $this->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', [
            'ticks' => $fixture['ticks'], 'transitions' => $fixture['transitions'],
        ])->assertOk()->assertJsonPath('score', $fixture['expected']['score'])
            ->assertJsonPath('verification', 'server-replay');
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->withToken($other['token'])
            ->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertJsonPath('data', []);

        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:45:01Z'));
        $this->artisan('arcade:finalize-weekly-awards', [
            '--apply' => true, '--json' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 1);
        $this->assertDatabaseCount('arcade_coupons', 1);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        $wallet = $this->withToken($player['token'])
            ->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.0.status', 'issued')->json('data.0');
        $this->assertMatchesRegularExpression('/^DMC-[A-F0-9]{32}$/D', $wallet['code']);
        $this->withToken($other['token'])
            ->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertJsonPath('data', []);
        $this->artisan('arcade:finalize-weekly-awards', [
            '--apply' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_weekly_award_finalizations', 1);
        $this->assertDatabaseCount('arcade_coupons', 1);
        Mail::assertNothingOutgoing();
        Notification::assertNothingSent();
    }
}
