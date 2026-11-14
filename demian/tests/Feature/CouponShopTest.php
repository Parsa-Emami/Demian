<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression for retired Phase-8 merchant API. A customer or remote merchant
 * cannot apply a voucher; only the in-cafe cashier session can do that.
 */
final class CouponShopTest extends TestCase
{
    use RefreshDatabase;

    public function test_online_coupon_paths_are_not_routable_even_with_legacy_flag(): void
    {
        config()->set('demian-coupons.shop_enabled', true);
        foreach (['quote', 'reserve', 'commit', 'cancel'] as $action) {
            $this->postJson('/api/v1/arcade/shop/coupons/'.$action, [
                'code' => 'DMC-'.str_repeat('A', 32),
                'currency' => 'IRR', 'subtotal_minor' => 10000,
                'order_ref' => 'legacy-test-001',
            ])->assertNotFound();
        }

        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
        $this->assertDatabaseCount('arcade_coupon_shop_requests', 0);
    }

    public function test_player_bearer_cannot_open_cashier_pages_without_staff_login(): void
    {
        config()->set('demian-coupons.cafe_enabled', true);
        $this->get('/cashier')->assertRedirect(route('cashier.login'));
        $this->post('/cashier/redeem', [
            'code' => 'DMC-'.str_repeat('A', 32),
            'ticket_ref' => 'ticket-00001', 'subtotal_minor' => 10000,
            'request_key' => '30ae26ec-15ba-4289-92e6-1a911aa63901',
            'confirmed' => '1',
        ])->assertRedirect(route('cashier.login'));
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }
}
