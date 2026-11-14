<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CouponShopTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T02:00:00Z'));
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.issue_enabled', true);
        config()->set('demian-coupons.shop_enabled', true);
        config()->set('demian-coupons.policy_version', 'demo-approved-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        config()->set('demian-coupons.shop_signing_secret', str_repeat('S', 48));
        config()->set('demian-coupons.order_hash_key', str_repeat('H', 48));
    }

    private function issueCoupons(int $count = 1): array
    {
        $players = [];
        for ($i = 1; $i <= $count; $i++) {
            $player = $this->postJson('/api/v1/arcade/players', [
                'display_name' => 'Winner '.$i,
            ])->assertCreated()->json();
            $players[] = $player;
            $run = (string) Str::uuid();
            DB::table('arcade_runs')->insert([
                'id' => $run, 'player_id' => $player['player_id'],
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2', 'character_slug' => 'darya',
                'seed' => 1, 'track_width' => 420, 'status' => 'verified',
                'score' => 1000 - $i, 'ticks' => 1, 'passed' => 1,
                'replay_hash' => hash('sha256', $run), 'started_at' => '2026-11-10 10:00:00',
                'expires_at' => '2026-11-10 11:00:00',
                'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_leaderboard_entries')->insert([
                'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
                'period_key' => CompetitionClock::periodKeys(CarbonImmutable::parse('2026-11-10T10:00:00Z'))[2],
                'player_id' => $player['player_id'], 'run_id' => $run,
                'score' => 1000 - $i, 'achieved_at' => '2026-11-10 10:00:00',
            ]);
        }
        app(WeeklySettlementService::class)->seal('2026-11-07');
        app(CouponIssuanceService::class)->issueWeek('weekly:tehran:2026-11-07');
        return array_map(fn (array $p): array => [
            ...$p,
            'code' => $this->withToken($p['token'])
                ->getJson('/api/v1/arcade/player/coupons')->assertOk()->json('data.0.code'),
        ], $players);
    }

    private function signed(string $action, array $body, ?string $event = null,
        ?int $timestamp = null, ?string $secret = null, ?string $signFor = null)
    {
        $event ??= 'event-'.Str::random(20);
        $timestamp ??= now()->getTimestamp();
        $secret ??= str_repeat('S', 48);
        $url = '/api/v1/arcade/shop/coupons/'.$action;
        $json = json_encode($body, JSON_THROW_ON_ERROR);
        $signature = 'sha256='.hash_hmac('sha256', $timestamp."\n".$event."\n"
            .ltrim($signFor ?? $url, '/')."\n".$json, $secret);
        return $this->call('POST', $url, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_DEMIAN_SHOP_TIMESTAMP' => (string) $timestamp,
            'HTTP_X_DEMIAN_SHOP_EVENT_ID' => $event,
            'HTTP_X_DEMIAN_SHOP_SIGNATURE' => $signature,
        ], $json);
    }

    private function price(string $code, int $minor = 10000): array
    {
        return ['code' => $code, 'currency' => 'IRR', 'subtotal_minor' => $minor];
    }

    private function order(string $code, string $order = 'shop-order-00001',
        int $minor = 10000): array
    {
        return [...$this->price($code, $minor), 'order_ref' => $order];
    }

    public function test_unsigned_wrong_key_old_timestamp_and_wrong_path_are_rejected(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->postJson('/api/v1/arcade/shop/coupons/quote', $this->price($code))
            ->assertUnauthorized();
        $this->signed('quote', $this->price($code), secret: str_repeat('X', 48))
            ->assertUnauthorized();
        $this->signed('quote', $this->price($code), timestamp: now()->timestamp - 601)
            ->assertUnauthorized();
        $this->signed('quote', $this->price($code),
            signFor: '/api/v1/arcade/shop/coupons/reserve')->assertUnauthorized();
        $this->assertDatabaseCount('arcade_coupon_shop_requests', 0);
    }

    public function test_checkout_is_disabled_without_explicit_approval_and_keys(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        config()->set('demian-coupons.shop_enabled', false);
        $this->signed('quote', $this->price($code))->assertStatus(503);
        config()->set('demian-coupons.shop_enabled', true);
        config()->set('demian-coupons.shop_signing_secret', '');
        $this->signed('quote', $this->price($code))->assertStatus(503);
    }

    public function test_quote_is_integer_exact_and_respects_minimum_cap_currency_and_expiry(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->signed('quote', $this->price($code, 10000))
            ->assertOk()->assertJsonPath('discount_minor', 3000);
        $this->signed('quote', $this->price($code, 20000))
            ->assertOk()->assertJsonPath('discount_minor', 5000);
        $this->signed('quote', $this->price($code, 999))->assertUnprocessable();
        $this->signed('quote', [...$this->price($code), 'currency' => 'USD'])
            ->assertUnprocessable();
        $this->assertDatabaseCount('arcade_coupon_reservations', 0);
    }

    public function test_reserve_commit_is_atomic_and_coupon_cannot_be_reused(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $order = $this->order($code);
        $held = $this->signed('reserve', $order)->assertCreated()
            ->assertJsonPath('status', 'reserved')->assertJsonPath('discount_minor', 3000);
        $this->assertNotNull($held->json('reservation_id'));
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
        $this->signed('commit', ['code' => $code, 'order_ref' => $order['order_ref']])
            ->assertOk()->assertJsonPath('status', 'redeemed')
            ->assertJsonPath('discount_minor', 3000);
        $this->signed('commit', ['code' => $code, 'order_ref' => $order['order_ref']])
            ->assertOk()->assertJsonPath('status', 'redeemed');
        $this->signed('reserve', $this->order($code, 'other-order-00001'))
            ->assertStatus(409);
        $this->signed('cancel', ['code' => $code, 'order_ref' => $order['order_ref']])
            ->assertStatus(409);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 1);
        $this->assertDatabaseHas('arcade_coupons', ['status' => 'redeemed']);
        $this->assertSame(1, DB::table('arcade_coupon_events')
            ->where('event_type', 'redeemed')->count());
    }

    public function test_reservation_blocks_other_orders_and_amount_changes(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->signed('reserve', $this->order($code))->assertCreated();
        $this->signed('reserve', $this->order($code, 'another-order-001'))
            ->assertStatus(409);
        $this->signed('reserve', $this->order($code, 'shop-order-00001', 11000))
            ->assertStatus(409);
        $this->signed('reserve', $this->order($code))
            ->assertOk()->assertJsonPath('discount_minor', 3000);
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
    }

    public function test_signed_event_retries_are_idempotent_and_payload_conflict_is_blocked(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $body = $this->order($code);
        $event = 'merchant-event-0001';
        $first = $this->signed('reserve', $body, $event)->assertCreated()->json();
        $again = $this->signed('reserve', $body, $event)->assertCreated()->json();
        $this->assertSame($first, $again);
        $this->signed('reserve', $this->order($code, 'other-order-00001'), $event)
            ->assertStatus(409);
        $this->assertDatabaseCount('arcade_coupon_shop_requests', 1);
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
    }

    public function test_cancelling_frees_coupon_for_new_order_but_old_order_stays_blocked(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->signed('reserve', $this->order($code))->assertCreated();
        $cancel = ['code' => $code, 'order_ref' => 'shop-order-00001'];
        $this->signed('cancel', $cancel)->assertOk()->assertJsonPath('status', 'cancelled');
        $this->signed('cancel', $cancel)->assertOk()->assertJsonPath('status', 'cancelled');
        $this->signed('reserve', $this->order($code))->assertStatus(409);
        $this->signed('reserve', $this->order($code, 'second-order-00001'))->assertCreated();
        $this->assertDatabaseCount('arcade_coupon_reservations', 2);
        $this->assertSame(1, DB::table('arcade_coupon_events')
            ->where('event_type', 'reservation_cancelled')->count());
    }

    public function test_expired_reservation_cannot_commit_and_a_new_order_can_reserve(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->signed('reserve', $this->order($code))->assertCreated();
        $this->travel(16)->minutes();
        $this->signed('commit', ['code' => $code, 'order_ref' => 'shop-order-00001'])
            ->assertStatus(410);
        $this->signed('reserve', $this->order($code, 'second-order-00001'))->assertCreated();
        $this->assertDatabaseHas('arcade_coupon_reservations', ['status' => 'expired']);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_coupon_expiry_and_revocation_block_spend_and_hide_code_in_wallet(): void
    {
        config()->set('demian-coupons.valid_days', '1');
        $player = $this->issueCoupons()[0];
        $this->travel(2)->days();
        $this->signed('quote', $this->price($player['code']))->assertStatus(410);
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertJsonPath('data.0.status', 'expired')
            ->assertJsonPath('data.0.code', null);
    }

    public function test_one_shop_order_cannot_stack_coupons(): void
    {
        $players = $this->issueCoupons(2);
        $this->signed('reserve', $this->order($players[0]['code']))->assertCreated();
        $this->signed('reserve', $this->order($players[1]['code']))->assertStatus(409);
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
    }

    public function test_rotation_allows_previous_shop_key_during_transition(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        config()->set('demian-coupons.shop_previous_signing_secret', str_repeat('O', 48));
        $this->signed('quote', $this->price($code), secret: str_repeat('O', 48))
            ->assertOk();
        config()->set('demian-coupons.shop_previous_signing_secret', '');
        $this->signed('quote', $this->price($code), secret: str_repeat('O', 48))
            ->assertUnauthorized();
    }

    public function test_deleted_account_cancels_hold_and_prevents_commit(): void
    {
        $player = $this->issueCoupons()[0];
        $this->signed('reserve', $this->order($player['code']))->assertCreated();
        $this->withToken($player['token'])->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->signed('commit', ['code' => $player['code'], 'order_ref' => 'shop-order-00001'])
            ->assertStatus(409);
        $this->assertDatabaseHas('arcade_coupons', ['status' => 'revoked', 'player_id' => null]);
        $this->assertDatabaseHas('arcade_coupon_reservations', ['status' => 'cancelled']);
    }

    public function test_shop_audit_never_stores_plaintext_order_reference_or_coupon_code(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->signed('reserve', $this->order($code))->assertCreated();
        $this->signed('commit', ['code' => $code, 'order_ref' => 'shop-order-00001'])->assertOk();
        foreach (['arcade_coupon_events', 'arcade_coupon_shop_requests'] as $table) {
            $rows = DB::table($table)->get();
            $this->assertGreaterThan(0, $rows->count());
            $json = $rows->toJson();
            $this->assertStringNotContainsString($code, $json);
            $this->assertStringNotContainsString('shop-order-00001', $json);
        }
    }

    public function test_commit_without_a_prior_reservation_is_rejected(): void
    {
        $code = $this->issueCoupons()[0]['code'];
        $this->signed('commit', [
            'code' => $code, 'order_ref' => 'shop-order-00001',
        ])->assertStatus(409);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }
}
