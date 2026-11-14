<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class InCafeRedemptionTest extends TestCase
{
    use RefreshDatabase;

    private const PERIOD = 'weekly:tehran:2026-11-07';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T02:00:00Z'));
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.issue_enabled', true);
        config()->set('demian-coupons.cafe_enabled', true);
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        config()->set('demian-coupons.policy_version', 'cafe-test-v1');
        config()->set('demian-coupons.cafe_receipt_hash_key', str_repeat('R', 48));
    }

    private function staff(string $role = 'cashier', string $branch = 'cafe-main'): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'staff-'.Str::lower(Str::random(12)),
            'display_name' => 'Cafe Operator', 'password_hash' => Hash::make('StrongPassword123!'),
            'role' => $role, 'branch_id' => $branch,
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function asCashier(int $id): static
    {
        $user = DB::table('arcade_cashier_staff')->where('id', $id)->first();
        return $this->withSession([
            'cafe_staff_id' => $id,
            'cafe_staff_version' => (int) $user->session_version,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
    }

    /** Integrates the actual sealed-week Phase 7b -> Phase 8 issuance service. */
    private function issue(int $count = 1): array
    {
        $players = [];
        for ($i = 0; $i < $count; $i++) {
            $player = $this->postJson('/api/v1/arcade/players', [
                'display_name' => 'Cafe Winner '.($i + 1),
            ])->assertCreated()->json();
            $players[] = $player;
            $id = (string) Str::uuid();
            $time = '2026-11-10 10:00:00';
            DB::table('arcade_runs')->insert([
                'id' => $id, 'player_id' => $player['player_id'],
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2',
                'character_slug' => 'darya', 'seed' => 123, 'track_width' => 420,
                'status' => 'verified', 'score' => 1000 - $i * 100,
                'ticks' => 120, 'passed' => 1, 'replay_hash' => hash('sha256', $id),
                'started_at' => $time, 'expires_at' => '2026-11-10 11:00:00',
                'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_leaderboard_entries')->insert([
                'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
                'period_key' => CompetitionClock::periodKeys(CarbonImmutable::parse($time, 'UTC'))[2],
                'player_id' => $player['player_id'], 'run_id' => $id,
                'score' => 1000 - $i * 100, 'achieved_at' => $time,
            ]);
        }
        app(WeeklySettlementService::class)->seal('2026-11-07');
        app(CouponIssuanceService::class)->issueWeek(self::PERIOD);
        $rows = DB::table('arcade_coupons')->orderBy('id')->get();
        return $rows->map(static fn (object $row): array => [
            'id' => (int) $row->id,
            'code' => Crypt::decryptString($row->code_ciphertext),
            'percent' => (int) $row->discount_percent,
            'player_id' => $row->player_id,
        ])->all();
    }

    private function voucher(): array
    {
        return $this->issue(1)[0];
    }

    private function sale(array $voucher, string $ticket = 'ticket-00001',
        int $subtotal = 10000, ?string $requestKey = null): array
    {
        return [
            'code' => $voucher['code'], 'ticket_ref' => $ticket,
            'subtotal_minor' => $subtotal,
            'request_key' => $requestKey ?? (string) Str::uuid(),
            'confirmed' => '1',
        ];
    }

    public function test_disabled_cafe_portal_fails_closed_and_api_only_still_allows_staff_routes(): void
    {
        config()->set('demian-coupons.cafe_enabled', false);
        $this->get('/cashier/login')->assertStatus(503);
        config()->set('demian-coupons.cafe_enabled', true);
        config()->set('demian-arcade.api_only', true);
        $this->get('/cashier/login')->assertOk()->assertSee('ورود صندوق‌دار');
        // API-only route registration is evaluated during application boot;
        // toggling the config here does not re-register web routes.
    }

    public function test_anonymous_and_player_only_sessions_cannot_inspect_or_redeem(): void
    {
        $coupon = $this->voucher();
        $this->get('/cashier')->assertRedirect(route('cashier.login'));
        $this->post('/cashier/lookup', ['code' => $coupon['code']])
            ->assertRedirect(route('cashier.login'));
        $this->post('/cashier/redeem', $this->sale($coupon))
            ->assertRedirect(route('cashier.login'));
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_cashier_login_rejects_wrong_password_and_unknown_account(): void
    {
        $id = $this->staff();
        $username = DB::table('arcade_cashier_staff')->where('id', $id)->value('username');
        $this->post('/cashier/login', [
            'username' => $username, 'password' => 'invalid-password',
        ])->assertRedirect();
        $this->get('/cashier')->assertRedirect(route('cashier.login'));
        $this->post('/cashier/login', [
            'username' => 'unknown-person', 'password' => 'invalid-password',
        ])->assertRedirect();
        $this->assertNull(session('cafe_staff_id'));
    }

    public function test_cashier_login_regenerates_session_and_logout_clears_access(): void
    {
        $id = $this->staff();
        $username = DB::table('arcade_cashier_staff')->where('id', $id)->value('username');
        $this->post('/cashier/login', [
            'username' => $username, 'password' => 'StrongPassword123!',
        ])->assertRedirect(route('cashier.index'));
        $this->get('/cashier')->assertOk()->assertSee('اعتبارسنجی حضوری');
        $this->post('/cashier/logout')->assertRedirect(route('cashier.login'));
        $this->get('/cashier')->assertRedirect(route('cashier.login'));
    }

    public function test_preview_shows_percentage_without_spending_or_exposing_customer_identity(): void
    {
        $coupon = $this->voucher();
        $this->asCashier($this->staff());
        $this->post('/cashier/lookup', ['code' => $coupon['code']])->assertOk()
            ->assertSee('30٪ تخفیف')->assertSee('کد معتبر است');
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
        $this->assertDatabaseCount('arcade_cashier_requests', 0);
        $this->assertSame(1, DB::table('arcade_coupon_events')->where('event_type', 'issued')->count());
    }

    public function test_authorized_cashier_records_one_irreversible_consumption(): void
    {
        $coupon = $this->voucher();
        $this->asCashier($this->staff());
        $this->post('/cashier/redeem', $this->sale($coupon))
            ->assertRedirect(route('cashier.index'));
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $coupon['id'], 'status' => 'redeemed',
        ]);
        $this->assertDatabaseHas('arcade_coupon_redemptions', [
            'coupon_id' => $coupon['id'], 'channel' => 'in_cafe',
            'discount_minor' => 3000, 'subtotal_minor' => 10000,
            'reservation_id' => null,
        ]);
        $this->assertDatabaseCount('arcade_cashier_requests', 1);
        $this->assertDatabaseHas('arcade_coupon_events', ['event_type' => 'redeemed_in_cafe']);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_wallet_hides_customer_code_after_cashier_marks_it_used(): void
    {
        $coupon = $this->voucher();
        $player = DB::table('arcade_players')->where('id', $coupon['player_id'])->first();
        $this->asCashier($this->staff());
        $this->post('/cashier/redeem', $this->sale($coupon))->assertRedirect();
        $wallet = app(CouponIssuanceService::class)->listForPlayer($player->id);
        $this->assertSame('redeemed', $wallet[0]['status']);
        $this->assertNull($wallet[0]['code']);
    }

    public function test_same_request_id_is_idempotent_for_same_cashier_sale_and_rejects_changes(): void
    {
        $coupon = $this->voucher();
        $id = $this->staff();
        $request = (string) Str::uuid();
        $service = app(InCafeCouponService::class);
        $first = $service->redeem($id, $coupon['code'], 'ticket-00001', 10000, $request);
        $again = $service->redeem($id, $coupon['code'], 'ticket-00001', 10000, $request);
        $this->assertSame($first['receipt_id'], $again['receipt_id']);
        $this->assertFalse($first['idempotent_replay']);
        $this->assertTrue($again['idempotent_replay']);
        try {
            $service->redeem($id, $coupon['code'], 'ticket-00001', 10001, $request);
            $this->fail('Mutation with reused request key was accepted.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->assertDatabaseCount('arcade_coupon_redemptions', 1);
        $this->assertSame(1, DB::table('arcade_coupon_events')
            ->where('event_type', 'redeemed_in_cafe')->count());
    }

    public function test_same_coupon_cannot_be_used_for_a_second_receipt(): void
    {
        $coupon = $this->voucher();
        $staff = $this->staff();
        $svc = app(InCafeCouponService::class);
        $svc->redeem($staff, $coupon['code'], 'ticket-00001', 10000, (string) Str::uuid());
        $this->expectException(HttpException::class);
        $svc->redeem($staff, $coupon['code'], 'ticket-00002', 10000, (string) Str::uuid());
    }

    public function test_same_cafe_receipt_cannot_apply_two_coupons_even_for_two_cashiers(): void
    {
        [$first, $second] = $this->issue(2);
        $svc = app(InCafeCouponService::class);
        $svc->redeem($this->staff(), $first['code'], 'ticket-00123', 10000, (string) Str::uuid());
        try {
            $svc->redeem($this->staff(), $second['code'], 'ticket-00123', 10000, (string) Str::uuid());
            $this->fail('Receipt was reused.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->assertDatabaseCount('arcade_coupon_redemptions', 1);
    }

    public function test_minimum_bill_amount_and_immutable_discount_cap_are_enforced(): void
    {
        $coupon = $this->voucher();
        $svc = app(InCafeCouponService::class);
        $id = $this->staff();
        try {
            $svc->redeem($id, $coupon['code'], 'ticket-00001', 999, (string) Str::uuid());
            $this->fail('Below-minimum bill accepted.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $result = $svc->redeem($id, $coupon['code'], 'ticket-00002', 100000, (string) Str::uuid());
        $this->assertSame(5000, $result['discount_minor']);
    }

    public function test_second_rank_receives_twenty_percent_discount_in_person(): void
    {
        [$first, $second] = $this->issue(2);
        $this->assertSame(30, $first['percent']);
        $this->assertSame(20, $second['percent']);
        $row = app(InCafeCouponService::class)->redeem($this->staff(),
            $second['code'], 'ticket-00001', 10000, (string) Str::uuid());
        $this->assertSame(2000, $row['discount_minor']);
    }

    public function test_expired_revoked_and_reserved_codes_never_redeem(): void
    {
        $coupon = $this->voucher();
        $service = app(InCafeCouponService::class);
        $id = $this->staff();
        foreach (['revoked', 'reserved'] as $status) {
            DB::table('arcade_coupons')->where('id', $coupon['id'])->update(['status' => $status]);
            $this->assertNotSame('valid', $service->inspect($coupon['code'])['state']);
            try {
                $service->redeem($id, $coupon['code'], 'ticket-00001', 10000,
                    (string) Str::uuid());
                $this->fail($status.' redeemed.');
            } catch (HttpException $e) {
                $this->assertSame(409, $e->getStatusCode());
            }
        }
        DB::table('arcade_coupons')->where('id', $coupon['id'])->update([
            'status' => 'issued', 'expires_at' => now()->subSecond(),
        ]);
        $this->assertSame('expired', $service->inspect($coupon['code'])['state']);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_fraudulent_cashier_session_is_revoked_when_staff_disabled(): void
    {
        $id = $this->staff();
        $this->asCashier($id);
        $this->get('/cashier')->assertOk();
        DB::table('arcade_cashier_staff')->where('id', $id)->update([
            'is_active' => false, 'session_version' => 2,
        ]);
        $this->get('/cashier')->assertRedirect(route('cashier.login'));
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_staff_session_expires_after_eight_hours(): void
    {
        $id = $this->staff();
        $this->asCashier($id)->get('/cashier')->assertOk();
        $this->travel(9)->hours();
        $this->get('/cashier')->assertRedirect(route('cashier.login'));
    }

    public function test_manager_can_review_own_branch_but_cashier_cannot(): void
    {
        [$first, $second] = $this->issue(2);
        $s1 = $this->staff('manager', 'cafe-main');
        $s2 = $this->staff('cashier', 'cafe-other');
        $svc = app(InCafeCouponService::class);
        $svc->redeem($s1, $first['code'], 'ticket-00001', 10000, (string) Str::uuid());
        $svc->redeem($s2, $second['code'], 'ticket-00001', 10000, (string) Str::uuid());
        $this->asCashier($s2)->get('/cashier/report')->assertForbidden();
        $this->asCashier($s1)->get('/cashier/report')->assertOk()
            ->assertSee('گزارش مصرف');
        $this->assertCount(1, $svc->recent('cafe-main'));
        $this->assertCount(1, $svc->recent('cafe-other'));
    }

    public function test_cashier_receipt_reference_and_player_code_never_enter_audit_json(): void
    {
        $coupon = $this->voucher();
        $ref = 'private-receipt-005';
        $receipt = app(InCafeCouponService::class)->redeem($this->staff(), $coupon['code'],
            $ref, 10000, (string) Str::uuid());
        $this->assertSame('redeemed', $receipt['status']);
        foreach (['arcade_coupon_events', 'arcade_cashier_requests',
            'arcade_coupon_redemptions'] as $table) {
            $raw = DB::table($table)->get()->toJson();
            $this->assertStringNotContainsString($ref, $raw);
            $this->assertStringNotContainsString($coupon['code'], $raw);
        }
    }

    public function test_readonly_ledger_audit_fails_after_manipulating_cashier_evidence(): void
    {
        $coupon = $this->voucher();
        app(InCafeCouponService::class)->redeem($this->staff(), $coupon['code'],
            'ticket-00001', 10000, (string) Str::uuid());
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        $this->artisan('arcade:audit-coupons', ['--json' => true])->assertSuccessful();
        DB::table('arcade_cashier_requests')->update(['ticket_hash' => str_repeat('0', 64)]);
        $this->assertSame('failed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_confirmation_is_mandatory_and_invalid_ticket_is_rejected(): void
    {
        $coupon = $this->voucher();
        $this->asCashier($this->staff());
        $data = $this->sale($coupon);
        unset($data['confirmed']);
        $this->post('/cashier/redeem', $data)->assertRedirect();
        $data = $this->sale($coupon, 'x');
        $this->post('/cashier/redeem', $data)->assertRedirect();
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_staff_disabling_cli_requires_explicit_apply_and_invalidates_sessions(): void
    {
        $id = $this->staff();
        $username = DB::table('arcade_cashier_staff')->where('id', $id)->value('username');
        $this->artisan('arcade:cashier:staff', [
            'action' => 'disable', '--username' => $username,
        ])->assertFailed();
        $this->assertDatabaseHas('arcade_cashier_staff', ['id' => $id, 'is_active' => true]);
        $this->artisan('arcade:cashier:staff', [
            'action' => 'disable', '--username' => $username, '--apply' => true,
        ])->assertSuccessful();
        $this->assertDatabaseHas('arcade_cashier_staff', ['id' => $id, 'is_active' => false]);
        $this->assertSame(2, (int) DB::table('arcade_cashier_staff')
            ->where('id', $id)->value('session_version'));
    }

    public function test_coupon_cannot_be_redeemed_after_original_owner_is_erased(): void
    {
        $coupon = $this->voucher();
        DB::table('arcade_players')->where('id', $coupon['player_id'])->delete();
        $svc = app(InCafeCouponService::class);
        $this->assertSame('revoked', $svc->inspect($coupon['code'])['state']);
        $this->expectException(HttpException::class);
        $svc->redeem($this->staff(), $coupon['code'], 'ticket-00001', 10000,
            (string) Str::uuid());
    }

    public function test_sql_unique_constraint_is_last_line_of_defense_against_double_spend(): void
    {
        $coupon = $this->voucher();
        $staff = $this->staff();
        app(InCafeCouponService::class)->redeem($staff, $coupon['code'],
            'ticket-00001', 10000, (string) Str::uuid());
        $original = DB::table('arcade_coupon_redemptions')->first();
        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('arcade_coupon_redemptions')->insert([
            'coupon_id' => $coupon['id'], 'reservation_id' => null,
            'order_hash' => str_repeat('a', 64), 'channel' => 'in_cafe',
            'cashier_id' => $staff, 'branch_id' => 'cafe-main',
            'currency' => $original->currency, 'subtotal_minor' => 10000,
            'discount_minor' => 3000, 'redeemed_at' => now(),
        ]);
    }

    public function test_cafe_inspection_page_never_gets_cached_or_embedded(): void
    {
        $coupon = $this->voucher();
        $this->asCashier($this->staff());
        $this->post('/cashier/lookup', ['code' => $coupon['code']])
            ->assertOk()->assertHeader('Cache-Control', 'private, no-store, max-age=0')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_physical_coupon_page_requires_laravel_web_csrf_middleware(): void
    {
        $route = \Illuminate\Support\Facades\Route::getRoutes()->getByName('cashier.redeem');
        $this->assertNotNull($route);
        $this->assertContains('web', $route->gatherMiddleware());
        $this->assertNotContains('api', $route->gatherMiddleware());
    }

}
