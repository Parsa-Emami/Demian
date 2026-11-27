<?php

namespace Tests\Feature;

use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\QuietHoursService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class QuietHoursPhase18Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-20 10:00:00', 'UTC'));
        foreach ([
            'demian-arcade.require_contact' => false, 'demian-legal.require_acceptance' => false,
            'demian-quiet-hours.enabled' => true, 'demian-quiet-hours.daily_budget_minor' => 40000,
            'demian-quiet-hours.cost_ceiling_bps' => 6000, 'demian-quiet-hours.margin_floor_bps' => 1500,
            'demian-coupons.policy_approved' => true, 'demian-coupons.cafe_enabled' => true,
            'demian-coupons.policy_version' => 'test-v1', 'demian-coupons.currency' => 'IRR',
            'demian-coupons.min_order_minor' => 100000, 'demian-coupons.max_discount_minor' => 10000,
            'demian-coupons.valid_days' => 14, 'demian-coupons.cafe_receipt_hash_key' => str_repeat('r', 64),
            'demian-arcade.otp.enabled' => true,
            'demian-arcade.otp.gateway_url' => 'https://sms.example.test/send',
            'demian-arcade.otp.gateway_key' => str_repeat('s', 32),
        ] as $key => $value) {
            config()->set($key, $value);
        }
    }

    private function staff(string $role, string $branch = 'main'): int
    {
        $id = DB::table('arcade_cashier_staff')->insertGetId(['username' => 'staff'.Str::random(12), 'display_name' => 'Staff',
            'password_hash' => Hash::make('fixture-password'), 'branch_id' => $branch, 'role' => $role, 'is_active' => true,
            'session_version' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->withSession(['cafe_staff_id' => $id, 'cafe_staff_version' => 1, 'cafe_authenticated_at' => now()->timestamp]);

        return $id;
    }

    private function player(string $name, string $number, ?int $age = 72): array
    {
        $p = $this->postJson('/api/v1/arcade/players', [
            'display_name' => $name, 'contact_type' => 'phone', 'contact_value' => $number,
        ])->assertCreated()->json();
        if ($age !== null) {
            DB::table('arcade_players')->where('id', $p['player_id'])
                ->update(['phone_verified_at' => now()->subHours($age)->utc()]);
        }

        return $p;
    }

    private function input(array $override = []): array
    {
        return array_replace(['branch_id' => 'main', 'starts_at' => '2026-11-20T13:30', 'ends_at' => '2026-11-20T15:30',
            'occupied_seats' => 10, 'total_seats' => 40, 'percent' => 10, 'min_order_minor' => 100000,
            'max_discount_minor' => 10000, 'capacity' => 2], $override);
    }

    private function offer(int $staff, array $override = []): int
    {
        return app(QuietHoursService::class)->create($staff, 1, $this->input($override));
    }

    private function expectStatus(int $status, callable $fn): void
    {
        try {
            $fn();
            self::fail('Expected HTTP '.$status);
        } catch (HttpException $e) {
            self::assertSame($status, $e->getStatusCode());
        }
    }

    public function test_staff_access_occupancy_financial_limits_and_overlap(): void
    {
        $this->get('/cashier/admin/quiet-hours')->assertRedirect(route('cashier.login'));
        $this->staff('admin');
        $this->get('/cashier/admin/quiet-hours')->assertForbidden();
        $admin = $this->staff('super_admin');
        $this->get('/cashier/admin/quiet-hours')->assertOk()->assertSee('تخفیف هوشمند ساعات خلوت');
        $auth = ['password' => 'fixture-password', 'confirmed' => 1];
        $this->post('/cashier/admin/quiet-hours', [...$this->input(), ...$auth, 'password' => 'wrong'])->assertForbidden();
        $this->post('/cashier/admin/quiet-hours', [...$this->input(['occupied_seats' => 17]), ...$auth])->assertSessionHasErrors('offer');
        $this->post('/cashier/admin/quiet-hours', [...$this->input(), ...$auth])->assertRedirect(route('cashier.quiet-hours'));
        $this->assertDatabaseCount('arcade_quiet_offers', 1);
        $this->expectStatus(409, fn () => $this->offer($admin));
        $this->staff('cashier', 'second');
        $this->expectStatus(409, fn () => $this->offer($admin, ['branch_id' => 'second', 'capacity' => 3]));
        $this->offer($admin, ['branch_id' => 'second']);
        $this->assertDatabaseCount('arcade_quiet_offers', 2);
        $this->assertDatabaseCount('arcade_cashier_admin_events', 2);
    }

    public function test_private_one_per_day_claim_capacity_and_branch_bound_redemption(): void
    {
        $admin = $this->staff('super_admin');
        $otherCashier = $this->staff('cashier', 'second');
        $mainCashier = $this->staff('cashier');
        $offer = $this->offer($admin, ['capacity' => 1]);
        $otherOffer = $this->offer($admin, ['branch_id' => 'second']);
        $p = $this->player('quiet player', '+989121234567');
        $q = $this->player('second player', '+989121234568');
        $fresh = $this->player('new player', '+989121234569', 12);
        $this->getJson('/api/v1/arcade/player/quiet-hours')->assertUnauthorized();
        $this->withToken($fresh['token'])->postJson('/api/v1/arcade/player/quiet-hours/'.$offer.'/claim')->assertForbidden();
        $this->withToken($p['token'])->getJson('/api/v1/arcade/player/quiet-hours')->assertOk()
            ->assertJsonPath('eligible', true)->assertJsonCount(2, 'data');
        $first = $this->postJson('/api/v1/arcade/player/quiet-hours/'.$offer.'/claim')->assertOk()
            ->assertJsonPath('idempotent_replay', false)->assertJsonMissingPath('code')->json();
        $this->postJson('/api/v1/arcade/player/quiet-hours/'.$offer.'/claim')->assertOk()
            ->assertJsonPath('coupon_id', $first['coupon_id'])->assertJsonPath('idempotent_replay', true);
        $this->postJson('/api/v1/arcade/player/quiet-hours/'.$otherOffer.'/claim')->assertConflict();
        $this->withToken($q['token'])->postJson('/api/v1/arcade/player/quiet-hours/'.$offer.'/claim')->assertConflict();
        $this->getJson('/api/v1/arcade/player/coupons')->assertOk()->assertJsonCount(0, 'data');
        $this->withToken($p['token']);
        $wallet = $this->getJson('/api/v1/arcade/player/coupons')->assertOk()
            ->assertJsonPath('data.0.source', 'quiet_hours')->assertJsonPath('data.0.quiet_branch', 'main')->json('data.0');
        $this->assertMatchesRegularExpression('/^DMC-[A-F0-9]{32}$/D', $wallet['code']);
        $this->assertDatabaseCount('arcade_coupons', 1);
        $this->assertDatabaseCount('arcade_quiet_claims', 1);
        $service = app(InCafeCouponService::class);
        $key = (string) Str::uuid();
        $this->expectStatus(409, fn () => $service->redeem($otherCashier, $wallet['code'], 'BILL-001', 100000, $key));
        app(QuietHoursService::class)->pause($admin, 1, $offer);
        config()->set('demian-quiet-hours.enabled', false);
        $this->getJson('/api/v1/arcade/player/quiet-hours')->assertOk()->assertJsonPath('available', false);
        $r = $service->redeem($mainCashier, $wallet['code'], 'BILL-001', 100000, $key);
        self::assertSame(10000, $r['discount_minor']);
        $this->travel(3)->hours();
        self::assertTrue($service->redeem($mainCashier, $wallet['code'], 'BILL-001', 100000, $key)['idempotent_replay']);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 1);
    }

    public function test_expiry_pause_and_erased_identity_cannot_reclaim(): void
    {
        $admin = $this->staff('super_admin');
        $id = $this->offer($admin);
        $p = $this->player('first', '+989121234567');
        $this->withToken($p['token'])->postJson('/api/v1/arcade/player/quiet-hours/'.$id.'/claim')->assertOk();
        $this->deleteJson('/api/v1/arcade/player')->assertSuccessful();
        $this->assertDatabaseHas('arcade_quiet_claims', ['offer_id' => $id, 'player_id' => null]);
        $this->assertDatabaseHas('arcade_coupons', ['source' => 'quiet_hours', 'status' => 'revoked']);
        $next = $this->player('same number', '+989121234567');
        $this->withToken($next['token'])->postJson('/api/v1/arcade/player/quiet-hours/'.$id.'/claim')->assertConflict();
        $third = $this->player('third', '+989121234570');
        app(QuietHoursService::class)->pause($admin, 1, $id);
        $this->withToken($third['token'])->postJson('/api/v1/arcade/player/quiet-hours/'.$id.'/claim')->assertConflict();
        $this->travel(91)->days();
        app(QuietHoursService::class)->prune();
        $this->assertDatabaseHas('arcade_quiet_claims',['offer_id' => $id, 'identity_digest' => null]);
    }
}
