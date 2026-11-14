<?php

namespace Tests\Feature;

use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\CouponLifecycleService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ArcadeCouponLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private const WEEK = 'weekly:tehran:2026-11-14';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->travelTo(CarbonImmutable::parse('2026-11-21T01:00:00Z'));
        config()->set('demian-coupons.issuance_enabled', true);
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.store_enabled', true);
        config()->set('demian-coupons.currency', 'USD');
        config()->set('demian-coupons.valid_days', 30);
        config()->set('demian-coupons.minimum_minor', 200);
        config()->set('demian-coupons.cap_minor', 5000);
        config()->set('demian-coupons.store_id', 'test-shop');
        config()->set('demian-coupons.store_hmac_key', str_repeat('ab', 32));
    }

    private function player(): array
    {
        return $this->postJson('/api/v1/arcade/players',
            ['display_name' => 'Coupon Tester'])->assertCreated()->json();
    }

    private function sealed(array $players, array $ranks = []): void
    {
        DB::table('arcade_weekly_periods')->insert([
            'period_key' => self::WEEK, 'starts_at' => '2026-11-13 20:30:00',
            'ends_at' => '2026-11-20 20:30:00', 'status' => 'sealed',
            'sealed_at' => '2026-11-20 21:00:00',
            'participants' => count($players), 'winner_count' => count($players),
            'snapshot_hash' => str_repeat('f', 64),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $snapshot = [];
        foreach ($players as $i => $player) {
            $rank = $ranks[$i] ?? ($i + 1);
            $runId = (string) Str::uuid();
            DB::table('arcade_runs')->insert([
                'id' => $runId, 'player_id' => $player['player_id'],
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2',
                'character_slug' => 'darya', 'seed' => 123, 'track_width' => 420,
                'status' => 'verified', 'score' => 1000 - $i,
                'ticks' => 120, 'passed' => 1,
                'replay_hash' => hash('sha256', $runId),
                'started_at' => '2026-11-17 10:00:00',
                'expires_at' => '2026-11-17 11:00:00',
                'completed_at' => '2026-11-17 10:03:00',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_weekly_winners')->insert([
                'period_key' => self::WEEK, 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2',
                'player_id' => $player['player_id'], 'run_id' => $runId,
                'score' => 1000 - $i, 'achieved_at' => '2026-11-17 10:00:00',
                'technical_rank' => $rank, 'prize_rank' => $rank,
                'previous_winner' => false, 'created_at' => now(),
            ]);
            $row = [
                'period_key' => self::WEEK, 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2',
                'player_id' => $player['player_id'], 'run_id' => $runId,
                'score' => 1000 - $i, 'achieved_at' => '2026-11-17 10:00:00',
                'technical_rank' => $rank, 'created_at' => now()->utc()->toDateTimeString(),
            ];
            DB::table('arcade_weekly_results')->insert($row);
            $snapshot[] = $row;
        }
        DB::table('arcade_weekly_periods')->where('period_key', self::WEEK)
            ->update(['snapshot_hash' => hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR))]);
    }

    private function issueOne(int $rank = 1): array
    {
        $player = $this->player();
        $this->sealed([$player], [$rank]);
        $result = app(CouponIssuanceService::class)->issue(self::WEEK);
        $this->assertSame('issued', $result['status']);
        $mine = $this->withToken($player['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()->json('coupons.0');
        $this->assertNotNull($mine['code']);

        return [$player, $mine['code']];
    }

    private function checkout(array $player, string $code, string $order = 'order-100', int $total = 10000): array
    {
        return [
            'code' => $code, 'player_id' => $player['player_id'], 'order_id' => $order,
            'order_total_minor' => $total, 'currency' => 'USD',
        ];
    }

    private function store(string $operation, array $body, ?string $signature = null,
        ?string $nonce = null, ?int $timestamp = null)
    {
        $uri = '/api/v1/arcade/store/coupons/'.$operation;
        $raw = json_encode($body, JSON_THROW_ON_ERROR);
        $timestamp ??= now()->getTimestamp();
        $nonce ??= bin2hex(random_bytes(16));
        $signed = $timestamp."\n".$nonce."\nPOST\n".$uri."\n".$raw;
        $signature ??= hash_hmac('sha256', $signed, hex2bin(config('demian-coupons.store_hmac_key')));

        return $this->call('POST', $uri, [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_DEMIAN_TIMESTAMP' => (string) $timestamp,
            'HTTP_X_DEMIAN_NONCE' => $nonce,
            'HTTP_X_DEMIAN_SIGNATURE' => $signature,
        ], $raw);
    }

    public function test_issuance_is_off_by_default_and_requires_policy_approval(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        config()->set('demian-coupons.issuance_enabled', false);
        try {
            app(CouponIssuanceService::class)->issue(self::WEEK);
            $this->fail('Issued without feature gate.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(503, $e->getStatusCode());
        }
        config()->set('demian-coupons.issuance_enabled', true);
        config()->set('demian-coupons.policy_approved', false);
        $this->artisan('arcade:coupons:issue', [
            '--week' => '2026-11-14', '--apply' => true,
        ])->assertFailed();
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_issuance_requires_sealed_week_and_valid_monetary_policy(): void
    {
        $this->expectException(\RuntimeException::class);
        app(CouponIssuanceService::class)->issue(self::WEEK);
    }

    public function test_caps_and_currency_require_explicit_safe_configuration(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        config()->set('demian-coupons.cap_minor', 0);
        $this->expectException(\RuntimeException::class);
        app(CouponIssuanceService::class)->issue(self::WEEK);
    }

    public function test_batch_is_atomic_idempotent_and_codes_never_plaintext_at_rest(): void
    {
        $players = [$this->player(), $this->player(), $this->player()];
        $this->sealed($players);
        $issued = app(CouponIssuanceService::class)->issue(self::WEEK);
        $this->assertSame(3, $issued['coupons']);
        $this->assertDatabaseCount('arcade_coupons', 3);
        $this->assertDatabaseCount('arcade_coupon_events', 3);
        $this->assertSame('already_issued',
            app(CouponIssuanceService::class)->issue(self::WEEK)['status']);
        $this->assertDatabaseCount('arcade_coupon_events', 3);
        $coupons = DB::table('arcade_coupons')->orderBy('prize_rank')->get();
        $this->assertSame([30, 20, 20], $coupons->pluck('percent_off')->map(fn ($n) => (int) $n)->all());
        $this->assertCount(3, $coupons->pluck('code_hash')->unique());
        foreach ($coupons as $row) {
            $code = Crypt::decryptString($row->code_ciphertext);
            $this->assertMatchesRegularExpression('/^DMN-[A-F0-9]{32}$/', $code);
            $this->assertSame(hash('sha256', $code), $row->code_hash);
            $this->assertStringNotContainsString($code, json_encode(DB::table('arcade_coupon_events')->get()));
        }
        config()->set('demian-coupons.cap_minor', 3000);
        $this->expectException(\RuntimeException::class);
        app(CouponIssuanceService::class)->issue(self::WEEK);
    }

    public function test_owned_codes_are_private_and_never_returned_to_other_players(): void
    {
        [$player, $code] = $this->issueOne();
        $other = $this->player();
        $this->withToken($other['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertJsonCount(0, 'coupons');
        $this->withToken('invalid')->getJson('/api/v1/arcade/player/coupons')
            ->assertUnauthorized();
        $this->assertSame('DMN-', substr($code, 0, 4));
    }

    public function test_quote_reserve_capture_and_idempotent_retry_are_atomic(): void
    {
        [$p, $code] = $this->issueOne();
        $payload = $this->checkout($p, $code);
        $this->store('quote', $payload)->assertOk()->assertJsonPath('discount_minor', 3000);
        $this->assertDatabaseCount('arcade_coupon_reservations', 0);
        $this->store('reserve', $payload)->assertOk()
            ->assertJsonPath('status', 'reserved')->assertJsonPath('discount_minor', 3000);
        $this->store('reserve', $payload)->assertOk()->assertJsonPath('status', 'reserved');
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
        $this->store('capture', $payload)->assertOk()->assertJsonPath('status', 'captured');
        $this->store('capture', $payload)->assertOk()->assertJsonPath('status', 'captured');
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
        $this->assertSame(1, DB::table('arcade_coupon_events')->where('event_type', 'captured')->count());
        $this->store('release', $payload)->assertStatus(409);
        $this->store('reserve', $this->checkout($p, $code, 'order-200'))->assertStatus(422);
        $this->withToken($p['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertJsonPath('coupons.0.status', 'redeemed')->assertJsonPath('coupons.0.code', null);
    }

    public function test_release_frees_coupon_for_new_order_but_order_id_never_reused(): void
    {
        [$p, $code] = $this->issueOne();
        $first = $this->checkout($p, $code, 'one');
        $second = $this->checkout($p, $code, 'two');
        $this->store('reserve', $first)->assertOk();
        $this->store('release', $first)->assertOk()->assertJsonPath('status', 'released');
        $this->store('release', $first)->assertOk()->assertJsonPath('status', 'released');
        $this->store('reserve', $first)->assertStatus(409);
        $this->store('reserve', $second)->assertOk();
        $this->store('capture', $first)->assertStatus(409);
        $this->store('capture', $second)->assertOk();
        $this->assertDatabaseCount('arcade_coupon_reservations', 2);
    }

    public function test_expired_reservation_releases_automatically_but_cannot_capture_late(): void
    {
        [$p, $code] = $this->issueOne();
        $first = $this->checkout($p, $code, 'old');
        $next = $this->checkout($p, $code, 'new');
        $this->store('reserve', $first)->assertOk();
        $this->travel(16)->minutes();
        $this->store('capture', $first)->assertStatus(409);
        $this->store('reserve', $next)->assertOk()->assertJsonPath('status', 'reserved');
        $this->assertDatabaseHas('arcade_coupon_reservations', ['order_id' => 'old', 'state' => 'expired']);
        $this->assertSame(1, DB::table('arcade_coupon_events')->where('event_type', 'reservation_expired')->count());
        $this->store('capture', $next)->assertOk();
    }

    public function test_minimum_spend_discount_cap_wrong_currency_and_order_mutation_fail_closed(): void
    {
        [$p, $code] = $this->issueOne();
        $small = $this->checkout($p, $code, 'small', 199);
        $this->store('quote', $small)->assertStatus(422);
        $wrongCurrency = $this->checkout($p, $code);
        $wrongCurrency['currency'] = 'IRR';
        $this->store('quote', $wrongCurrency)->assertStatus(422);
        $expensive = $this->checkout($p, $code, 'large', 100000);
        $this->store('quote', $expensive)->assertOk()->assertJsonPath('discount_minor', 5000);
        $this->store('reserve', $expensive)->assertOk()->assertJsonPath('discount_minor', 5000);
        $changed = $this->checkout($p, $code, 'large', 99999);
        $this->store('capture', $changed)->assertStatus(409);
        $this->store('capture', $expensive)->assertOk()->assertJsonPath('discount_minor', 5000);
    }

    public function test_coupon_cannot_be_used_by_other_player_or_by_other_order_concurrently(): void
    {
        [$p, $code] = $this->issueOne();
        $other = $this->player();
        $this->store('quote', $this->checkout($other, $code))->assertStatus(422);
        $this->store('reserve', $this->checkout($p, $code, 'a'))->assertOk();
        $this->store('reserve', $this->checkout($p, $code, 'b'))->assertStatus(409);
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
        $this->store('capture', $this->checkout($p, $code, 'b'))->assertStatus(409);
    }

    public function test_store_signature_nonce_replay_timestamp_and_disabled_gate(): void
    {
        [$p, $code] = $this->issueOne();
        $body = $this->checkout($p, $code);
        $this->store('quote', $body, str_repeat('0', 64))->assertUnauthorized();
        $nonce = bin2hex(random_bytes(16));
        $this->store('quote', $body, null, $nonce)->assertOk();
        $this->store('quote', $body, null, $nonce)->assertStatus(409);
        $this->store('quote', $body, null, null, now()->subMinutes(6)->timestamp)
            ->assertUnauthorized();
        $this->store('quote', $body, null, 'invalid')->assertUnauthorized();
        config()->set('demian-coupons.store_enabled', false);
        $this->store('quote', $body)->assertStatus(503);
    }

    public function test_redeemed_coupon_cannot_be_resold_or_refunded_by_releasing(): void
    {
        [$p, $code] = $this->issueOne();
        $body = $this->checkout($p, $code);
        $this->store('reserve', $body)->assertOk();
        $this->store('capture', $body)->assertOk();
        $this->store('release', $body)->assertStatus(409);
        $this->store('quote', $body)->assertStatus(409);
        $this->assertSame(1, DB::table('arcade_coupon_events')->where('event_type', 'captured')->count());
    }

    public function test_erasure_revokes_code_clears_ciphertext_and_preserves_audit(): void
    {
        [$p, $code] = $this->issueOne();
        $this->store('reserve', $this->checkout($p, $code))->assertOk();
        $this->withToken($p['token'])->deleteJson('/api/v1/arcade/player')->assertOk();
        $coupon = DB::table('arcade_coupons')->first();
        $this->assertSame('revoked', $coupon->status);
        $this->assertNull($coupon->player_id);
        $this->assertNull($coupon->code_ciphertext);
        $this->assertDatabaseCount('arcade_coupon_events', 3);
        $this->assertDatabaseHas('arcade_coupon_reservations', ['state' => 'released']);
        $this->store('capture', $this->checkout($p, $code))->assertStatus(422);
        $this->assertDatabaseCount('arcade_reward_batches', 1);
    }

    public function test_coupon_expiration_blocks_new_purchase_but_keeps_audit_history(): void
    {
        [$p, $code] = $this->issueOne();
        $this->travel(31)->days();
        $this->store('quote', $this->checkout($p, $code))->assertStatus(422);
        DB::table('arcade_players')->where('id', $p['player_id'])
            ->update(['token_expires_at' => now()->addDay()]);
        $this->withToken($p['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertJsonPath('coupons.0.status', 'expired')->assertJsonPath('coupons.0.code', null);
        $this->assertDatabaseCount('arcade_coupon_events', 1);
    }

    public function test_order_identifier_is_unique_across_different_coupon_codes(): void
    {
        $p = [$this->player(), $this->player()];
        $this->sealed($p);
        app(CouponIssuanceService::class)->issue(self::WEEK);
        $c1 = $this->withToken($p[0]['token'])->getJson('/api/v1/arcade/player/coupons')
            ->json('coupons.0.code');
        $c2 = $this->withToken($p[1]['token'])->getJson('/api/v1/arcade/player/coupons')
            ->json('coupons.0.code');
        $this->store('reserve', $this->checkout($p[0], $c1, 'shared'))->assertOk();
        $this->store('reserve', $this->checkout($p[1], $c2, 'shared'))->assertStatus(409);
        $this->assertDatabaseCount('arcade_coupon_reservations', 1);
    }

    public function test_command_requires_explicit_apply_and_does_not_print_secrets(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        $this->artisan('arcade:coupons:issue', ['--week' => '2026-11-14'])->assertFailed();
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->artisan('arcade:coupons:issue', [
            '--week' => '2026-11-14', '--apply' => true, '--json' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_coupons', 1);
    }

    public function test_readonly_audit_detects_policy_and_coupon_evidence_tampering(): void
    {
        [$p, $code] = $this->issueOne();
        $audit = app(\App\Services\Arcade\CouponIntegrityAudit::class);
        $this->assertSame('passed', $audit->inspect()['status']);
        $this->artisan('arcade:coupons:audit', ['--json' => true])->assertSuccessful();
        DB::table('arcade_coupons')->update(['code_hash' => str_repeat('a', 64)]);
        $this->assertSame('failed', $audit->inspect()['status']);
        $this->artisan('arcade:coupons:audit', ['--json' => true])->assertFailed();
    }

    public function test_catch_up_issues_each_sealed_week_once(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        $issuer = app(CouponIssuanceService::class);
        $results = $issuer->issuePending();
        $this->assertCount(1, $results);
        $this->assertSame('issued', $results[0]['status']);
        $this->assertSame([], $issuer->issuePending());
        $this->assertDatabaseCount('arcade_reward_batches', 1);
        $this->assertDatabaseCount('arcade_coupon_events', 1);
    }

    public function test_issuance_fails_when_archived_winner_has_lost_server_verification(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        DB::table('arcade_runs')->update(['status' => 'started']);
        $this->expectException(\RuntimeException::class);
        app(CouponIssuanceService::class)->issue(self::WEEK);
    }

    public function test_erased_winner_cannot_receive_fresh_code_from_stale_archive(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        $this->withToken($p['token'])->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->expectException(\RuntimeException::class);
        app(CouponIssuanceService::class)->issue(self::WEEK);
    }


    public function test_tampered_sealed_technical_ranking_cannot_issue_real_value(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        DB::table('arcade_weekly_results')->update(['score' => 999999]);
        try {
            app(CouponIssuanceService::class)->issue(self::WEEK);
            $this->fail('Issued code from modified seal.');
        } catch (\RuntimeException $expected) {
            $this->assertStringContainsString('checksum', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertDatabaseCount('arcade_reward_batches', 0);
    }

    public function test_forged_winner_technical_placement_cannot_issue_real_value(): void
    {
        $p = $this->player();
        $this->sealed([$p]);
        DB::table('arcade_weekly_winners')->update(['technical_rank' => 77]);
        $this->expectException(\RuntimeException::class);
        app(CouponIssuanceService::class)->issue(self::WEEK);
    }

}
