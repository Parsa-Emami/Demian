<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\ManualCouponGiftService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class ManualCouponGiftsTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'StrongPassword123!';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        config()->set('demian-coupons.cafe_enabled', true);
        config()->set('demian-coupons.manual_gifts_enabled', true);
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.issue_enabled', false); // Gifts ≠ weekly issuance.
        config()->set('demian-coupons.policy_version', 'approved-cafe-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        config()->set('demian-coupons.cafe_receipt_hash_key', str_repeat('R', 48));
    }

    private function staff(string $role = 'super_admin'): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'staff'.Str::lower(Str::random(12)),
            'display_name' => 'Cafe Operator',
            'password_hash' => Hash::make(self::PASSWORD),
            'branch_id' => 'main-cafe', 'role' => $role,
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function loginAs(int $id): static
    {
        $staff = DB::table('arcade_cashier_staff')->where('id', $id)->first();

        return $this->withSession([
            'cafe_staff_id' => $id,
            'cafe_staff_version' => (int) $staff->session_version,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
    }

    private function player(string $displayName = 'Gift Player Alpha'): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => $displayName,
        ])->assertCreated()->json();
    }

    private function giftData(array $player, array $changes = []): array
    {
        return array_replace([
            'player_id' => $player['player_id'],
            'request_key' => (string) Str::uuid(),
            'percent' => 10,
            'min_order_minor' => 1000,
            'max_discount_minor' => 5000,
            'valid_days' => 7,
            'reason' => 'birthday',
            'reason_note' => 'Approved birthday present',
        ], $changes);
    }

    private function issue(int $issuer, array $player, array $overrides = []): array
    {
        return app(ManualCouponGiftService::class)
            ->issue($issuer, 1, $this->giftData($player, $overrides));
    }

    public function test_superadmin_gifts_share_one_of_existing_ten_permissions_without_expanding_admin(): void
    {
        $this->assertCount(10, CafeAccess::CAPABILITIES);
        $this->assertCount(10, CafeAccess::abilities('super_admin'));
        $this->assertSame(['coupon.lookup', 'report.branch', 'staff.directory'],
            CafeAccess::abilities('admin'));
        $this->assertCount(3, CafeAccess::abilities('admin'));
        $this->assertCount(0, CafeAccess::abilities('unknown'));
        $this->assertNotContains('coupon.gift', CafeAccess::CAPABILITIES);
    }

    public function test_manual_issuance_defaults_disabled_and_cannot_bypass_business_policy(): void
    {
        $root = $this->staff();
        $p = $this->player();
        config()->set('demian-coupons.manual_gifts_enabled', false);
        $this->expectException(HttpException::class);
        $this->issue($root, $p);
    }

    public function test_unapproved_policy_and_inactive_cafe_cannot_issue_gifts(): void
    {
        $root = $this->staff();
        $p = $this->player();
        foreach (['policy_approved', 'cafe_enabled'] as $gate) {
            config()->set('demian-coupons.'.$gate, false);
            try {
                $this->issue($root, $p);
                $this->fail('Issued with gate disabled: '.$gate);
            } catch (\Throwable $expected) {
                $this->assertDatabaseCount('arcade_coupon_gifts', 0);
                $this->assertDatabaseCount('arcade_coupons', 0);
            } finally {
                config()->set('demian-coupons.'.$gate, true);
            }
        }
    }

    public function test_admin_manager_and_cashier_cannot_open_gift_form_or_mint(): void
    {
        $p = $this->player();
        foreach (['admin', 'manager', 'cashier'] as $role) {
            $staff = $this->staff($role);
            $this->loginAs($staff)->get('/cashier/admin/gifts')->assertForbidden();
            $this->post('/cashier/admin/gifts/issue', $this->giftData($p, [
                'password' => self::PASSWORD, 'confirmed' => '1',
            ]))->assertForbidden();
            try {
                $this->issue($staff, $p);
                $this->fail($role.' issued a gift.');
            } catch (HttpException $e) {
                $this->assertSame(403, $e->getStatusCode());
            }
        }
        $this->assertDatabaseCount('arcade_coupon_gifts', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_superadmin_can_find_player_without_exposing_authentication_secrets(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $other = $this->player('Another Player');
        $response = $this->loginAs($root)
            ->get('/cashier/admin/gifts?q=Gift')->assertOk()
            ->assertSee($p['player_id'])
            ->assertDontSee($other['player_id'])
            ->assertSee('صدور کد هدیه');
        $response->assertDontSee($p['token']);
        $this->assertDatabaseCount('arcade_coupon_gifts', 0);
    }

    public function test_step_up_password_checkbox_and_csrf_web_middleware_protect_gift_issuance(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $this->loginAs($root)->post('/cashier/admin/gifts/issue',
            $this->giftData($p, ['password' => 'incorrect', 'confirmed' => '1']))
            ->assertForbidden();
        $this->post('/cashier/admin/gifts/issue',
            $this->giftData($p, ['password' => self::PASSWORD]))
            ->assertSessionHasErrors('confirmed');
        $route = \Illuminate\Support\Facades\Route::getRoutes()
            ->getByName('cashier.gifts.issue');
        $this->assertContains('web', $route->gatherMiddleware());
        $this->assertNotContains('api', $route->gatherMiddleware());
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_superadmin_gift_is_single_use_and_visible_only_to_recipient_wallet(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $other = $this->player('Other Guest');
        $this->loginAs($root)->post('/cashier/admin/gifts/issue',
            $this->giftData($p, ['password' => self::PASSWORD, 'confirmed' => '1']))
            ->assertRedirect(route('cashier.gifts'));

        $gift = DB::table('arcade_coupon_gifts')->first();
        $coupon = DB::table('arcade_coupons')->first();
        $this->assertNull($coupon->winner_id);
        $this->assertSame('gift', $coupon->source);
        $this->assertSame((int) $gift->id, (int) $coupon->gift_id);
        $this->assertSame(10, (int) $coupon->discount_percent);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
        $this->assertDatabaseCount('arcade_weekly_periods', 0);
        $this->assertDatabaseCount('arcade_cashier_admin_events', 1);
        $this->assertDatabaseCount('arcade_coupon_events', 1);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);

        $mine = $this->withToken($p['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()->json('data.0');
        $this->assertSame('gift', $mine['source']);
        $this->assertSame('birthday', $mine['gift_reason']);
        $this->assertNull($mine['prize_rank']);
        $this->assertNull($mine['period_key']);
        $this->assertSame(10, $mine['discount_percent']);
        $this->assertMatchesRegularExpression('/^DMC-[A-F0-9]{32}$/', $mine['code']);
        $this->assertSame(hash('sha256', $mine['code']), $coupon->code_hash);
        $this->assertSame($mine['code'], Crypt::decryptString($coupon->code_ciphertext));
        $this->assertStringNotContainsString($mine['code'],
            DB::table('arcade_cashier_admin_events')->first()->details);
        $this->withToken($other['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_cashier_consumes_manual_gift_using_existing_atomic_in_cafe_flow(): void
    {
        $root = $this->staff();
        $cashier = $this->staff('cashier');
        $p = $this->player();
        $issued = $this->issue($root, $p);
        $this->assertSame('issued', $issued['status']);
        $wallet = app(CouponIssuanceService::class)->listForPlayer($p['player_id']);
        $code = $wallet[0]['code'];
        $this->assertSame('valid', app(InCafeCouponService::class)->inspect($code)['state']);
        $receipt = app(InCafeCouponService::class)->redeem(
            $cashier, $code, 'ticket-gift-2026-0001', 10000, (string) Str::uuid());
        $this->assertSame('redeemed', $receipt['status']);
        $this->assertSame(1000, $receipt['discount_minor']);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 1);
        $this->assertNull(app(CouponIssuanceService::class)
            ->listForPlayer($p['player_id'])[0]['code']);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        try {
            app(InCafeCouponService::class)->redeem(
                $cashier, $code, 'ticket-gift-2026-0002', 10000, (string) Str::uuid());
            $this->fail('Gift coupon reused.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    public function test_duplicate_request_id_is_idempotent_without_duplicating_gifts_or_audit(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $data = $this->giftData($p);
        $one = app(ManualCouponGiftService::class)->issue($root, 1, $data);
        $two = app(ManualCouponGiftService::class)->issue($root, 1, $data);
        $this->assertFalse($one['idempotent_replay']);
        $this->assertTrue($two['idempotent_replay']);
        $this->assertSame($one['gift_id'], $two['gift_id']);
        $this->assertSame($one['coupon_id'], $two['coupon_id']);
        $this->assertDatabaseCount('arcade_coupon_gifts', 1);
        $this->assertDatabaseCount('arcade_coupons', 1);
        $this->assertDatabaseCount('arcade_cashier_admin_events', 1);
        $this->assertDatabaseCount('arcade_coupon_events', 1);
    }

    public function test_mutated_or_other_issuer_reused_idempotency_key_fails_closed(): void
    {
        $root = $this->staff();
        $secondRoot = $this->staff();
        $p = $this->player();
        $data = $this->giftData($p);
        $svc = app(ManualCouponGiftService::class);
        $svc->issue($root, 1, $data);
        try {
            $svc->issue($root, 1, [...$data, 'percent' => 20]);
            $this->fail('Changed request replay was accepted.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        try {
            $svc->issue($secondRoot, 1, $data);
            $this->fail('Other issuer replay was accepted.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->assertDatabaseCount('arcade_coupon_gifts', 1);
    }

    public function test_recipient_daily_limit_is_transactionally_enforced(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $this->issue($root, $p);
        try {
            $this->issue($root, $p);
            $this->fail('Daily recipient cap was bypassed.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        $this->assertDatabaseCount('arcade_coupon_gifts', 1);
    }

    public function test_issuer_daily_limit_is_independent_of_player_limit(): void
    {
        config()->set('demian-coupons.gift_issuer_daily_limit', 1);
        $root = $this->staff();
        $p1 = $this->player();
        $p2 = $this->player('Second Gift Recipient');
        $this->issue($root, $p1);
        try {
            $this->issue($root, $p2);
            $this->fail('Daily issuer cap bypassed.');
        } catch (HttpException $e) {
            $this->assertSame(429, $e->getStatusCode());
        }
        $this->assertDatabaseCount('arcade_coupon_gifts', 1);
    }

    public function test_custom_percentage_spend_cap_and_expiry_cannot_exceed_approved_policy(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $invalid = [
            ['percent' => 31], ['percent' => 0],
            ['max_discount_minor' => 5001], ['max_discount_minor' => 0],
            ['min_order_minor' => 999], ['valid_days' => 31],
            ['valid_days' => 0], ['reason' => 'not-authorized'],
        ];
        foreach ($invalid as $change) {
            try {
                $this->issue($root, $p, $change);
                $this->fail('Invalid gift terms accepted: '.json_encode($change));
            } catch (\Illuminate\Validation\ValidationException $e) {
                $this->assertNotEmpty($e->errors());
            }
        }
        $this->assertDatabaseCount('arcade_coupon_gifts', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_disabled_staff_and_stale_session_cannot_mint_gift(): void
    {
        $root = $this->staff();
        $p = $this->player();
        DB::table('arcade_cashier_staff')->where('id', $root)
            ->update(['session_version' => 2]);
        try {
            $this->issue($root, $p);
            $this->fail('Stale session issued a gift.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
        DB::table('arcade_cashier_staff')->where('id', $root)->update([
            'is_active' => false,
        ]);
        try {
            app(ManualCouponGiftService::class)->issue($root, 2, $this->giftData($p));
            $this->fail('Disabled superadmin issued a gift.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
    }

    public function test_account_erasure_revokes_gift_and_preserves_anonymized_audit(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $issued = $this->issue($root, $p);
        $this->withToken($p['token'])
            ->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $issued['coupon_id'], 'source' => 'gift',
            'player_id' => null, 'status' => 'revoked', 'code_ciphertext' => null,
        ]);
        $this->assertDatabaseHas('arcade_coupon_gifts', [
            'id' => $issued['gift_id'], 'player_id' => null,
        ]);
        $this->assertDatabaseCount('arcade_coupon_events', 2);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_superadmin_can_revoke_unspent_gift_but_cannot_restore_it(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $issued = $this->issue($root, $p);
        $this->loginAs($root)->post('/cashier/admin/coupons/revoke', [
            'coupon_id' => $issued['coupon_id'], 'reason' => 'incident',
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertRedirect(route('cashier.index'));
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $issued['coupon_id'], 'status' => 'revoked', 'code_ciphertext' => null,
        ]);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_gift_integrity_audit_detects_tampered_source_or_actor_history(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $this->issue($root, $p);
        $this->artisan('arcade:audit-coupons', ['--json' => true])->assertSuccessful();
        DB::table('arcade_coupons')->update(['source' => 'weekly']);
        $this->assertSame('failed', app(CouponLedgerAudit::class)->inspect()['status']);
        DB::table('arcade_coupons')->update(['source' => 'gift']);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        DB::table('arcade_cashier_admin_events')
            ->where('event_type', 'coupon_gift_issued')->delete();
        $this->assertSame('failed', app(CouponLedgerAudit::class)->inspect()['status']);
    }

    public function test_superadmin_list_never_contains_private_bearer_code(): void
    {
        $root = $this->staff();
        $p = $this->player();
        $this->issue($root, $p);
        $code = app(CouponIssuanceService::class)
            ->listForPlayer($p['player_id'])[0]['code'];
        $html = $this->loginAs($root)->get('/cashier/admin/gifts?q=Gift')
            ->assertOk()->getContent();
        $this->assertStringContainsString('تاریخچه ۵۰ هدیه اخیر', $html);
        $this->assertStringNotContainsString($code, $html);
        $this->assertStringNotContainsString($p['token'], $html);
        $this->assertDatabaseCount('arcade_weekly_results', 0);
    }
}
