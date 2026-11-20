<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\CampaignEconomics;
use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\RewardCampaignService;
use App\Services\Arcade\WeeklyCompetitionService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

final class RewardCampaignStep14Test extends TestCase
{
    use RefreshDatabase;

    private const WEEK = 'weekly:tehran:2026-11-07';
    private const PASSWORD = 'StrongPassword123!';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->travelTo(CarbonImmutable::parse('2026-11-06T00:00:00Z'));
        config()->set('demian-coupons.cafe_enabled', true);
        config()->set('demian-coupons.campaigns_enabled', true);
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.issue_enabled', true);
        config()->set('demian-coupons.policy_version', 'approved-campaign-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        app(WeeklyCompetitionService::class)->ensure(
            CarbonImmutable::parse('2026-11-08T00:00:00Z'));
    }

    private function staff(string $role = 'super_admin'): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'operator'.Str::lower(Str::random(9)),
            'display_name' => 'Operator',
            'password_hash' => Hash::make(self::PASSWORD),
            'branch_id' => 'main-cafe', 'role' => $role,
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function loginAs(int $id): static
    {
        return $this->withSession([
            'cafe_staff_id' => $id, 'cafe_staff_version' => 1,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
    }

    private function data(array $overrides = []): array
    {
        return array_replace([
            'period_key' => self::WEEK, 'title' => 'Weekly Cafe Discount',
            'max_awards' => 2, 'min_order_minor' => 1000,
            'max_discount_minor' => 5000, 'valid_days' => 14,
            'percent_first' => 30, 'percent_second' => 20,
            'percent_third' => 20, 'percent_other' => 10,
        ], $overrides);
    }

    private function code(int $number): string
    {
        return sprintf('DMC-%032X', $number);
    }

    private function campaign(int $actor, array $data = []): int
    {
        return app(RewardCampaignService::class)->create($actor, 1, $this->data($data));
    }

    private function import(int $actor, int $campaignId, array $codes,
        ?string $key = null): array
    {
        return app(RewardCampaignService::class)->import($actor, 1, $campaignId,
            $key ?? (string) Str::uuid(), implode("\n", $codes));
    }

    private function ready(int $actor, int $stock = 2, int $capacity = 2): int
    {
        $id = $this->campaign($actor, ['max_awards' => $capacity]);
        $codes = [];
        for ($i = 1; $i <= $stock; $i++) $codes[] = $this->code($i);
        $this->import($actor, $id, $codes);
        app(RewardCampaignService::class)->transition($actor, 1, $id, 'activate');

        return $id;
    }

    private function seal(int $count = 2): array
    {
        $players = [];
        $this->travelTo(CarbonImmutable::parse('2026-11-14T02:00:00Z'));
        for ($i = 1; $i <= $count; $i++) {
            $player = $this->postJson('/api/v1/arcade/players', [
                'display_name' => 'Campaign Player '.$i,
            ])->assertCreated()->json();
            $players[] = $player;
            $run = (string) Str::uuid();
            $started = '2026-11-10 10:00:00';
            DB::table('arcade_runs')->insert([
                'id' => $run, 'player_id' => $player['player_id'],
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2', 'character_slug' => 'darya',
                'seed' => 123, 'track_width' => 420, 'status' => 'verified',
                'score' => 1000 - $i * 10, 'ticks' => 120, 'passed' => 1,
                'replay_hash' => hash('sha256', $run),
                'started_at' => $started, 'expires_at' => '2026-11-10 11:00:00',
                'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_leaderboard_entries')->insert([
                'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
                'period_key' => CompetitionClock::periodKeys(
                    CarbonImmutable::parse($started, 'UTC'))[2],
                'player_id' => $player['player_id'], 'run_id' => $run,
                'score' => 1000 - $i * 10, 'achieved_at' => $started,
            ]);
        }
        app(WeeklySettlementService::class)->seal('2026-11-07');

        return $players;
    }

    private function economicData(array $overrides = []): array
    {
        config()->set('demian-coupons.economics_required', true);
        config()->set('demian-coupons.weekly_budget_minor', '12000');
        return array_replace([
            'max_awards' => 2, 'min_order_minor' => 10000, 'max_discount_minor' => 5000,
            'percent_first' => 20, 'percent_second' => 15, 'percent_third' => 12, 'percent_other' => 8,
            'budget_minor' => 10000, 'cost_ceiling_bps' => 5000, 'margin_floor_bps' => 2000,
            'incremental_share_bps' => 7000, 'planned_operating_minor' => 1000,
        ], $overrides);
    }

    public function test_economics_blocks_underfunding_unsafe_margin_and_negative_scenario(): void
    {
        $root = $this->staff();
        foreach ([
            ['budget_minor' => 9999], ['budget_minor' => 12001],
            ['cost_ceiling_bps' => 9000], ['incremental_share_bps' => 0],
            ['planned_operating_minor' => 5000], ['margin_floor_bps' => 9000],
        ] as $bad) {
            try {
                $this->campaign($root, $this->economicData($bad));
                $this->fail('Unsafe economics accepted.');
            } catch (RuntimeException $expected) {
                $this->assertNotEmpty($expected->getMessage());
            }
        }
        $this->assertDatabaseCount('arcade_reward_campaigns', 0);
    }

    public function test_new_weekly_issue_cannot_bypass_economics_through_legacy_configuration(): void
    {
        $this->economicData();
        config()->set('demian-coupons.campaigns_enabled', false);
        $this->seal(1);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('approved budgeted campaign');
        app(CouponIssuanceService::class)->issueWeek(self::WEEK);
    }

    public function test_economics_freezes_capacity_and_prevents_unbudgeted_issuance(): void
    {
        $root = $this->staff();
        $id = $this->campaign($root, $this->economicData());
        $this->import($root, $id, [$this->code(1), $this->code(2)]);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
        $this->seal(2);
        $campaign = DB::table('arcade_reward_campaigns')->where('id', $id)->first();
        $this->assertSame(10000, app(CampaignEconomics::class)->frozen($campaign)['budget_minor']);
        DB::table('arcade_reward_campaigns')->where('id', $id)->update(['max_awards' => 3]);
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Tampered capacity accepted.');
        } catch (RuntimeException $expected) {
            $this->assertDatabaseCount('arcade_coupons', 0);
        }
        DB::table('arcade_reward_campaigns')->where('id', $id)->update(['max_awards' => 2]);
        config()->set('demian-coupons.weekly_budget_minor', 9999);
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Reduced owner budget ignored.');
        } catch (RuntimeException $expected) {
            $this->assertDatabaseCount('arcade_coupons', 0);
        }
        config()->set('demian-coupons.weekly_budget_minor', 12000);
        $this->assertSame(2, app(CouponIssuanceService::class)->issueWeek(self::WEEK)['created']);
        $this->assertSame(0, app(CouponIssuanceService::class)->issueWeek(self::WEEK)['created']);
        $campaign = DB::table('arcade_reward_campaigns')->where('id', $id)->first();
        $report = app(CampaignEconomics::class)->report($campaign);
        $this->assertSame(10000, $report['committed_minor']);
        $this->assertSame(10000, $report['outstanding_minor']);
        $this->assertSame(0, $report['budget_remaining_minor']);
        $this->assertNull($report['measurement']);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_financial_report_uses_pos_ledger_and_measured_roi_is_not_invented(): void
    {
        $root = $this->staff();
        $id = $this->campaign($root, $this->economicData());
        $this->import($root, $id, [$this->code(1), $this->code(2)]);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
        $players = $this->seal(2);
        app(CouponIssuanceService::class)->issueWeek(self::WEEK);
        config()->set('demian-coupons.cafe_receipt_hash_key', str_repeat('k', 64));
        $cashier = $this->staff('cashier');
        $code = app(CouponIssuanceService::class)->listForPlayer($players[0]['player_id'])[0]['code'];
        $key = (string) Str::uuid();
        $service = app(InCafeCouponService::class);
        $receipt = $service->redeem($cashier, $code, 'POS-0011', 10000, $key);
        $this->assertSame(2000, $receipt['discount_minor']);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        $this->assertTrue($service->redeem($cashier, $code, 'POS-0011', 10000, $key)['idempotent_replay']);
        $read = fn () => app(CampaignEconomics::class)->report(DB::table('arcade_reward_campaigns')->where('id', $id)->first());
        $report = $read();
        $this->assertSame(10000, $report['gross_minor']);
        $this->assertSame(8000, $report['net_sales_minor']);
        $this->assertSame(2000, $report['discount_minor']);
        $this->assertSame(5000, $report['outstanding_minor']);
        $this->assertSame(500, $report['scenario']['net_incremental_minor']);
        $this->assertNull($report['measurement']);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'close');
        $data = ['evidence_ref' => 'AUDIT-2026-01', 'incremental_contribution_minor' => 4000, 'operating_minor' => 1000];
        try {
            app(RewardCampaignService::class)->measure($root, 1, $id, $data);
            $this->fail('ROI closed while a live coupon remained.');
        } catch (RuntimeException $expected) {
            $this->assertNull($read()['measurement']);
        }
        $this->travel(15)->days();
        app(RewardCampaignService::class)->measure($root, 1, $id, $data);
        $this->assertSame(1000, $read()['measurement']['net_incremental_minor']);
        $this->assertEqualsWithDelta(33.33, $read()['measurement']['roi_percent'], .01);
        $this->loginAs($root)->get('/cashier/admin/campaigns')->assertOk()->assertSee('AUDIT-2026-01')->assertDontSee($code);
    }

    public function test_dynamic_campaign_preview_seal_and_issue_agree_and_detect_tampering(): void
    {
        config()->set('demian-coupons.dynamic_allocation_required', true);
        $root = $this->staff();
        $id = $this->campaign($root, $this->economicData());
        $this->import($root, $id, [$this->code(1), $this->code(2)]);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
        $campaign = DB::table('arcade_reward_campaigns')->where('id', $id)->first();
        $preview = app(\App\Services\Arcade\WeeklyAllocationService::class)->preview($campaign);
        $this->assertSame('provisional', $preview['status']);
        $this->assertSame(0, $preview['winner_count']);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        $this->seal(20);
        $this->assertDatabaseCount('arcade_weekly_results', 20);
        $this->assertDatabaseCount('arcade_weekly_winners', 2);
        $preview = app(\App\Services\Arcade\WeeklyAllocationService::class)->preview($campaign);
        $this->assertSame('sealed', $preview['status']);
        $this->assertSame(1000, $preview['award_rate_bps']);
        $this->assertSame(10000, $preview['maximum_commitment_minor']);
        DB::table('arcade_weekly_winners')->where('prize_rank', 1)->update(['previous_winner' => true]);
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Altered award proof was accepted.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('proof mismatch', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
        DB::table('arcade_weekly_winners')->where('prize_rank', 1)->update(['previous_winner' => false]);
        $this->assertSame(2, app(CouponIssuanceService::class)->issueWeek(self::WEEK)['created']);
        $this->assertSame(0, app(CouponIssuanceService::class)->issueWeek(self::WEEK)['created']);
        $this->loginAs($root)->get('/cashier/admin/campaigns')->assertOk()->assertSee('سهمیه پویای برندگان');
    }

    public function test_dynamic_campaign_below_minimum_keeps_technical_results_without_awards(): void
    {
        config()->set('demian-coupons.dynamic_allocation_required', true);
        $root = $this->staff();
        $id = $this->campaign($root, $this->economicData());
        $this->import($root, $id, [$this->code(1), $this->code(2)]);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
        $this->seal(19);
        $this->assertDatabaseCount('arcade_weekly_results', 19);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_default_off_and_all_non_superadmin_roles_are_rejected(): void
    {
        $root = $this->staff();
        config()->set('demian-coupons.campaigns_enabled', false);
        $this->loginAs($root)->get('/cashier/admin/campaigns')->assertServiceUnavailable();
        config()->set('demian-coupons.campaigns_enabled', true);
        foreach (['admin', 'manager', 'cashier'] as $role) {
            $staff = $this->staff($role);
            $this->loginAs($staff)->get('/cashier/admin/campaigns')->assertForbidden();
            $this->post('/cashier/admin/campaigns',
                $this->data(['password' => self::PASSWORD, 'confirmed' => '1']))
                ->assertForbidden();
            try {
                $this->campaign($staff);
                $this->fail('Non-superadmin created a campaign.');
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $expected) {
                $this->assertSame(403, $expected->getStatusCode());
            }
        }
        $this->assertDatabaseCount('arcade_reward_campaigns', 0);
    }

    public function test_campaign_rejects_unprepared_or_started_weeks_and_unapproved_policy(): void
    {
        $root = $this->staff();
        foreach ([
            ['period_key' => 'weekly:tehran:2026-12-26'],
            ['percent_first' => 31], ['percent_second' => 25],
            ['min_order_minor' => 100], ['max_discount_minor' => 10000],
            ['valid_days' => 1000],
        ] as $bad) {
            try {
                $this->campaign($root, $bad);
                $this->fail('Unapproved campaign terms accepted.');
            } catch (RuntimeException $expected) {
                $this->assertNotEmpty($expected->getMessage());
            }
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-08T00:00:00Z'));
        $this->expectException(RuntimeException::class);
        $this->campaign($root);
    }

    public function test_admin_forms_are_session_csrf_stepup_and_immutable_after_activation(): void
    {
        $root = $this->staff();
        $this->loginAs($root)->get('/cashier/admin/campaigns')->assertOk();
        $this->post('/cashier/admin/campaigns', $this->data([
            'password' => 'bad', 'confirmed' => '1',
        ]))->assertForbidden();
        $this->post('/cashier/admin/campaigns', $this->data([
            'password' => self::PASSWORD,
        ]))->assertSessionHasErrors('confirmed');
        $this->post('/cashier/admin/campaigns', $this->data([
            'password' => self::PASSWORD, 'confirmed' => '1',
        ]))->assertRedirect(route('cashier.campaigns'));
        $id = (int) DB::table('arcade_reward_campaigns')->value('id');
        $this->post('/cashier/admin/campaigns/'.$id.'/revise', $this->data([
            'title' => 'Revised Discounts', 'percent_first' => 25,
            'password' => self::PASSWORD, 'confirmed' => '1',
        ]))->assertRedirect(route('cashier.campaigns'));
        $this->assertDatabaseHas('arcade_reward_campaigns', ['title' => 'Revised Discounts']);
        $this->import($root, $id, [$this->code(1), $this->code(2)]);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
        try {
            app(RewardCampaignService::class)->revise($root, 1, $id, $this->data());
            $this->fail('Active terms mutated.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('draft', $expected->getMessage());
        }
        $this->assertContains('web',
            \Illuminate\Support\Facades\Route::getRoutes()
                ->getByName('cashier.campaigns.import')->gatherMiddleware());
    }

    public function test_import_is_idempotent_encrypted_and_rejects_duplicate_or_bad_codes(): void
    {
        $root = $this->staff();
        $id = $this->campaign($root);
        $key = (string) Str::uuid();
        $this->assertSame(['imported' => 2, 'existing' => 0],
            $this->import($root, $id, [$this->code(1), $this->code(2)], $key));
        $this->assertSame(['imported' => 0, 'existing' => 2],
            $this->import($root, $id, [$this->code(2), $this->code(1)], $key));
        $item = DB::table('arcade_reward_inventory')->first();
        $this->assertSame($this->code(1), Crypt::decryptString($item->code_ciphertext));
        $this->assertStringNotContainsString($this->code(1), $item->code_ciphertext);
        $this->assertStringNotContainsString($this->code(1),
            DB::table('arcade_reward_campaign_events')->first()->details);
        foreach ([[$this->code(1)], ['INVALID'], [$this->code(3), $this->code(3)]] as $bad) {
            try {
                $this->import($root, $id, $bad);
                $this->fail('Invalid/duplicate codes imported.');
            } catch (RuntimeException $expected) {
                $this->assertNotEmpty($expected->getMessage());
            }
        }
        $this->assertDatabaseCount('arcade_reward_inventory', 2);
        $this->assertDatabaseCount('arcade_reward_import_batches', 1);
    }

    public function test_active_campaign_needs_full_coverage_and_voiding_cannot_break_it(): void
    {
        $root = $this->staff();
        $id = $this->campaign($root);
        $this->import($root, $id, [$this->code(1)]);
        try {
            app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
            $this->fail('Understocked campaign activated.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('inventory', $expected->getMessage());
        }
        $this->import($root, $id, [$this->code(2)]);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
        $inventoryId = (int) DB::table('arcade_reward_inventory')->min('id');
        try {
            app(RewardCampaignService::class)->voidCode($root, 1, $inventoryId);
            $this->fail('Promised active inventory voided.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('coverage', $expected->getMessage());
        }
        app(RewardCampaignService::class)->transition($root, 1, $id, 'pause');
        app(RewardCampaignService::class)->voidCode($root, 1, $inventoryId);
        $this->assertDatabaseHas('arcade_reward_inventory', [
            'id' => $inventoryId, 'status' => 'void', 'code_ciphertext' => null,
        ]);
        $this->expectException(RuntimeException::class);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'activate');
    }

    public function test_sealed_winners_receive_exact_once_own_codes_with_no_email(): void
    {
        Mail::fake();
        Notification::fake();
        $root = $this->staff();
        $id = $this->ready($root);
        $players = $this->seal(2);
        $this->assertSame(2, app(CouponIssuanceService::class)->issueWeek(self::WEEK)['created']);
        $this->assertSame(0, app(CouponIssuanceService::class)->issueWeek(self::WEEK)['created']);
        $this->assertDatabaseCount('arcade_reward_inventory', 2);
        $this->assertDatabaseCount('arcade_coupons', 2);
        $this->assertSame(2, DB::table('arcade_reward_inventory')
            ->where('campaign_id', $id)->where('status', 'assigned')->count());
        $this->assertNull(DB::table('arcade_reward_inventory')->first()->code_ciphertext);
        $first = $this->withToken($players[0]['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')->json('data.0');
        $second = $this->withToken($players[1]['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()->json('data.0');
        $this->assertSame(30, $first['discount_percent']);
        $this->assertSame(20, $second['discount_percent']);
        $this->assertNotSame($first['code'], $second['code']);
        $this->assertContains($first['code'], [$this->code(1), $this->code(2)]);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        $this->loginAs($root)->get('/cashier/admin/campaigns')
            ->assertOk()->assertDontSee($first['code']);
        Mail::assertNothingOutgoing();
        Notification::assertNothingSent();
    }

    public function test_closed_or_paused_or_understocked_campaign_never_mints_any_coupon(): void
    {
        $root = $this->staff();
        $id = $this->ready($root);
        $this->seal(2);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'pause');
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Paused campaign minted coupons.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('not active', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
        app(RewardCampaignService::class)->transition($root, 1, $id, 'close');
        $this->expectException(RuntimeException::class);
        app(CouponIssuanceService::class)->issueWeek(self::WEEK);
    }

    public function test_tampered_inventory_fails_closed_without_partial_awards(): void
    {
        $root = $this->staff();
        $this->ready($root);
        $this->seal(2);
        DB::table('arcade_reward_inventory')->where('id',
            DB::table('arcade_reward_inventory')->min('id'))
            ->update(['code_ciphertext' => 'broken']);
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Invalid encrypted inventory assigned.');
        } catch (\Throwable $expected) {
            $this->assertNotEmpty($expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertSame(2, DB::table('arcade_reward_inventory')
            ->where('status', 'available')->count());
    }

    public function test_inventory_shortage_rolls_back_every_award_and_preserves_sealed_results(): void
    {
        $root = $this->staff();
        $this->ready($root);
        $this->seal(2);
        $id = DB::table('arcade_reward_inventory')->min('id');
        DB::table('arcade_reward_inventory')->where('id', $id)->update([
            'status' => 'void', 'code_ciphertext' => null, 'voided_at' => now(),
        ]);
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Insufficient stock minted partial coupons.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('Insufficient', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertDatabaseCount('arcade_weekly_winners', 2);
        $this->assertSame(0, DB::table('arcade_reward_inventory')
            ->where('status', 'assigned')->count());
    }

    public function test_revoking_an_issued_code_does_not_return_inventory_to_pool(): void
    {
        $root = $this->staff();
        $this->ready($root);
        $this->seal(2);
        app(CouponIssuanceService::class)->issueWeek(self::WEEK);
        $couponId = (int) DB::table('arcade_coupons')->min('id');
        app(CouponIssuanceService::class)->revoke($couponId, 'incident');
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $couponId, 'status' => 'revoked', 'code_ciphertext' => null,
        ]);
        $this->assertSame('assigned', DB::table('arcade_reward_inventory')
            ->where('coupon_id', $couponId)->value('status'));
        $this->assertSame(0, DB::table('arcade_reward_inventory')
            ->where('status', 'available')->count());
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_campaign_terms_tampering_aborts_issuance_before_any_assignment(): void
    {
        $root = $this->staff();
        $campaignId = $this->ready($root);
        $this->seal(2);
        DB::table('arcade_reward_campaigns')->where('id', $campaignId)
            ->update(['terms_hash' => str_repeat('0', 64)]);
        try {
            app(CouponIssuanceService::class)->issueWeek(self::WEEK);
            $this->fail('Tampered financial policy minted coupons.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('checksum', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
    }
}
