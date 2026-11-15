<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\CouponDeliverySupportService;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\InCafeCouponService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class CouponDeliveryStep16Test extends TestCase
{
    use RefreshDatabase;

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
        config()->set('demian-coupons.policy_version', 'support-verified-v1');
        config()->set('demian-coupons.cafe_receipt_hash_key', str_repeat('R', 48));
        config()->set('demian-coupons.delivery_support_enabled', true);
        config()->set('demian-coupons.manual_gifts_enabled', true);
    }

    private function staff(string $role = 'super_admin'): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'support-'.Str::lower(Str::random(12)),
            'display_name' => 'Support Test', 'password_hash' => Hash::make('StrongPassword123!'),
            'role' => $role, 'branch_id' => 'main-cafe', 'session_version' => 1,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function asStaff(int $id): static
    {
        return $this->withSession([
            'cafe_staff_id' => $id, 'cafe_staff_version' => 1,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
    }

    private function playerAndCoupon(int $score = 800): array
    {
        $owner = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Support Winner',
        ])->assertCreated()->json();

        $runId = (string) Str::uuid();
        $time = '2026-11-10 10:00:00';
        DB::table('arcade_runs')->insert([
            'id' => $runId, 'player_id' => $owner['player_id'],
            'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
            'character_slug' => 'darya', 'seed' => 123, 'track_width' => 420,
            'status' => 'verified', 'score' => $score, 'ticks' => 120,
            'passed' => 1, 'replay_hash' => hash('sha256', $runId),
            'started_at' => $time, 'expires_at' => '2026-11-10 11:00:00',
            'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
            'period_key' => CompetitionClock::periodKeys(CarbonImmutable::parse($time, 'UTC'))[2],
            'player_id' => $owner['player_id'], 'run_id' => $runId,
            'score' => $score, 'achieved_at' => $time,
        ]);
        app(WeeklySettlementService::class)->seal('2026-11-07');
        app(CouponIssuanceService::class)->issueWeek('weekly:tehran:2026-11-07');
        $coupon = DB::table('arcade_coupons')->first();

        return [
            ...$owner, 'coupon_id' => (int) $coupon->id,
            'code' => Crypt::decryptString($coupon->code_ciphertext),
        ];
    }

    private function open(array $owner, string $category = 'invalid_code',
        ?string $requestKey = null): array
    {
        return $this->withToken($owner['token'])->postJson(
            '/api/v1/arcade/player/coupons/'.$owner['coupon_id'].'/disputes', [
                'request_key' => $requestKey ?? (string) Str::uuid(),
                'category' => $category, 'description' => 'کد من هنگام خرید قابل استفاده نبود',
            ])->assertCreated()->json('data');
    }

    private function review(int $id, string $action,
        string $password = 'StrongPassword123!'): array
    {
        return [
            'decision' => $action,
            'resolution_note' => 'Reviewed original cashier ledger and player report.',
            'password' => $password, 'confirmed' => 1,
        ];
    }

    public function test_feature_is_off_independently_and_existing_wallet_never_changes_its_read_only_contract(): void
    {
        $owner = $this->playerAndCoupon();
        $id = $owner['coupon_id'];
        config()->set('demian-coupons.delivery_support_enabled', false);
        $this->withToken($owner['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()
            ->assertJsonPath('data.0.support_enabled', false)
            ->assertJsonPath('data.0.code', $owner['code']);
        $this->withToken($owner['token'])
            ->postJson("/api/v1/arcade/player/coupons/{$id}/acknowledge")
            ->assertStatus(503);
        $this->withToken($owner['token'])
            ->postJson("/api/v1/arcade/player/coupons/{$id}/disputes", [
                'request_key' => (string) Str::uuid(), 'category' => 'invalid_code',
            ])->assertStatus(503);
        $this->assertDatabaseCount('arcade_coupon_delivery_receipts', 0);
        $this->assertDatabaseCount('arcade_coupon_disputes', 0);
    }

    public function test_private_acknowledgement_is_exactly_once_and_nonowners_cannot_change_it(): void
    {
        $owner = $this->playerAndCoupon();
        $other = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Unrelated Player',
        ])->assertCreated()->json();
        $id = $owner['coupon_id'];
        $path = "/api/v1/arcade/player/coupons/{$id}/acknowledge";
        $this->postJson($path)->assertUnauthorized();
        $this->withToken($other['token'])->postJson($path)->assertNotFound();
        $this->withToken($owner['token'])->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.0.acknowledged_at', null);
        $this->assertDatabaseCount('arcade_coupon_delivery_receipts', 0);
        $this->withToken($owner['token'])->postJson($path)->assertOk()
            ->assertJsonPath('data.already_acknowledged', false);
        $this->withToken($owner['token'])->postJson($path)->assertOk()
            ->assertJsonPath('data.already_acknowledged', true);
        $this->assertDatabaseCount('arcade_coupon_delivery_receipts', 1);
        $this->assertSame(1, DB::table('arcade_coupon_events')
            ->where('event_type', 'delivery_acknowledged')->count());
        $response = $this->withToken($owner['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk();
        $this->assertNotNull($response->json('data.0.acknowledged_at'));
        $response->assertJsonPath('data.0.support_enabled', true);
    }

    public function test_case_is_private_idempotent_and_unique_per_open_coupon(): void
    {
        $owner = $this->playerAndCoupon();
        $other = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Different Owner',
        ])->assertCreated()->json();
        $id = $owner['coupon_id'];
        $key = (string) Str::uuid();
        $path = "/api/v1/arcade/player/coupons/{$id}/disputes";
        $data = [
            'request_key' => $key, 'category' => 'invalid_code',
            'description' => 'کد من هنگام خرید قابل استفاده نبود',
        ];
        $this->withToken($other['token'])->postJson($path, $data)->assertNotFound();
        $first = $this->withToken($owner['token'])
            ->postJson($path, $data)->assertCreated()->json('data');
        $this->withToken($owner['token'])->postJson($path, $data)
            ->assertOk()->assertJsonPath('data.case_id', $first['case_id'])
            ->assertJsonPath('data.idempotent_replay', true);
        $this->withToken($owner['token'])->postJson($path, [
            ...$data, 'category' => 'terms',
        ])->assertStatus(409);
        $this->withToken($owner['token'])->postJson($path, [
            ...$data, 'request_key' => (string) Str::uuid(),
        ])->assertStatus(409);
        $this->withToken($owner['token'])->postJson($path, [
            ...$data, 'request_key' => (string) Str::uuid(),
            'category' => 'other', 'description' => str_repeat('x', 301),
        ])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_coupon_disputes', 1);
        $this->assertDatabaseCount('arcade_coupon_dispute_events', 1);
        $wallet = $this->withToken($owner['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk();
        $wallet->assertJsonPath('data.0.case_status', 'open')
            ->assertJsonPath('data.0.case_id', $first['case_id']);
    }

    public function test_only_superadmin_with_fresh_password_and_session_can_close_a_case(): void
    {
        $owner = $this->playerAndCoupon();
        $case = $this->open($owner);
        $id = (int) $case['case_id'];
        $path = "/cashier/admin/coupon-support/{$id}/decision";
        $this->get('/cashier/admin/coupon-support')->assertRedirect(route('cashier.login'));
        $this->post($path, $this->review($id, 'explained'))
            ->assertRedirect(route('cashier.login'));
        $cashier = $this->staff('cashier');
        $this->asStaff($cashier)->get('/cashier/admin/coupon-support')->assertForbidden();
        $this->asStaff($cashier)->post($path, $this->review($id, 'explained'))
            ->assertForbidden();
        $admin = $this->staff('admin');
        $this->asStaff($admin)->get('/cashier/admin/coupon-support')->assertForbidden();
        $this->asStaff($admin)->post($path, $this->review($id, 'explained'))
            ->assertForbidden();
        $super = $this->staff();
        $this->asStaff($super)->get('/cashier/admin/coupon-support')->assertOk()
            ->assertDontSee($owner['code']);
        $this->asStaff($super)->post($path,
            $this->review($id, 'explained', 'wrong-password'))->assertForbidden();
        $this->assertDatabaseHas('arcade_coupon_disputes', [
            'id' => $id, 'status' => 'open',
        ]);
        $this->asStaff($super)->post($path, $this->review($id, 'explained'))
            ->assertRedirect(route('cashier.coupon-support'));
        $this->assertDatabaseHas('arcade_coupon_disputes', [
            'id' => $id, 'status' => 'resolved', 'resolution' => 'explained',
            'open_coupon_id' => null,
        ]);
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $owner['coupon_id'], 'status' => 'issued',
        ]);
        $this->asStaff($super)->post($path, $this->review($id, 'explained'))
            ->assertRedirect(route('cashier.coupon-support'));
        // The fourth admin mutation belongs to a new minute so the intended
        // 409 immutable-case conflict is tested beyond the 3/min security limit.
        $this->travel(61)->seconds();
        $this->asStaff($super)->post($path, $this->review($id, 'rejected'))
            ->assertStatus(409);
        $this->assertSame(1, DB::table('arcade_coupon_dispute_events')
            ->where('event_type', 'closed')->count());
        $this->assertSame(1, DB::table('arcade_cashier_admin_events')
            ->where('event_type', 'coupon_dispute_resolved')->count());
    }

    public function test_replacement_is_equivalent_atomic_and_only_delivered_to_owner_wallet(): void
    {
        Mail::fake();
        Notification::fake();
        $owner = $this->playerAndCoupon();
        $case = $this->open($owner);
        $staff = $this->staff();
        $path = '/cashier/admin/coupon-support/'.$case['case_id'].'/decision';
        $this->asStaff($staff)->post($path,
            $this->review((int) $case['case_id'], 'replaced'))
            ->assertRedirect(route('cashier.coupon-support'));
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $owner['coupon_id'], 'status' => 'revoked',
            'code_ciphertext' => null,
        ]);
        $this->assertDatabaseCount('arcade_coupon_gifts', 1);
        $this->assertDatabaseCount('arcade_coupons', 2);
        $caseRow = DB::table('arcade_coupon_disputes')->first();
        $replacement = DB::table('arcade_coupons')
            ->where('id', $caseRow->replacement_coupon_id)->first();
        $old = DB::table('arcade_coupons')->where('id', $owner['coupon_id'])->first();
        $this->assertSame($old->discount_percent, $replacement->discount_percent);
        $this->assertSame($old->min_order_minor, $replacement->min_order_minor);
        $this->assertSame($old->max_discount_minor, $replacement->max_discount_minor);
        $this->assertSame($old->player_id, $replacement->player_id);
        $this->assertSame('gift', $replacement->source);
        $this->assertNotSame($old->code_hash, $replacement->code_hash);
        $this->assertSame('passed', app(CouponLedgerAudit::class)->inspect()['status']);
        $this->assertSame('revoked', app(InCafeCouponService::class)
            ->inspect($owner['code'])['state']);
        $wallet = $this->withToken($owner['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk();
        $data = $wallet->json('data');
        $this->assertCount(2, $data);
        $this->assertSame('gift', $data[0]['source']);
        $this->assertSame('issued', $data[0]['status']);
        $this->assertMatchesRegularExpression('/^DMC-[A-F0-9]{32}$/',
            $data[0]['code']);
        $this->assertNull($data[1]['code']);
        $this->asStaff($staff)->post($path,
            $this->review((int) $case['case_id'], 'replaced'))
            ->assertRedirect(route('cashier.coupon-support'));
        $this->assertDatabaseCount('arcade_coupon_gifts', 1);
        Mail::assertNothingOutgoing();
        Notification::assertNothingSent();
    }

    public function test_disabled_compensation_rolls_back_revocation_case_and_all_financial_writes(): void
    {
        $owner = $this->playerAndCoupon();
        $case = $this->open($owner);
        $staff = $this->staff();
        config()->set('demian-coupons.manual_gifts_enabled', false);
        $this->asStaff($staff)->post(
            '/cashier/admin/coupon-support/'.$case['case_id'].'/decision',
            $this->review((int) $case['case_id'], 'replaced'))
            ->assertStatus(503);
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $owner['coupon_id'], 'status' => 'issued',
        ]);
        $this->assertDatabaseHas('arcade_coupon_disputes', [
            'id' => $case['case_id'], 'status' => 'open',
        ]);
        $this->assertDatabaseCount('arcade_coupon_gifts', 0);
        $this->assertSame(0, DB::table('arcade_coupon_events')
            ->where('event_type', 'revoked')->count());
    }

    public function test_redeemed_coupon_cannot_be_replaced_or_revoked_through_a_dispute(): void
    {
        $owner = $this->playerAndCoupon();
        $case = $this->open($owner);
        $cashier = $this->staff('cashier');
        $redemption = app(InCafeCouponService::class)->redeem(
            $cashier, $owner['code'], 'ticket-334477', 10000, (string) Str::uuid());
        $this->assertFalse($redemption['idempotent_replay']);
        $super = $this->staff();
        $url = '/cashier/admin/coupon-support/'.$case['case_id'].'/decision';
        foreach (['revoked', 'replaced'] as $decision) {
            $this->asStaff($super)->post($url,
                $this->review((int) $case['case_id'], $decision))->assertStatus(409);
        }
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $owner['coupon_id'], 'status' => 'redeemed',
        ]);
        $this->assertDatabaseCount('arcade_coupon_gifts', 0);
        $this->assertDatabaseHas('arcade_coupon_disputes', [
            'id' => $case['case_id'], 'status' => 'open',
        ]);
    }

    public function test_player_erasure_scrubs_support_notes_and_revokes_unspent_code(): void
    {
        $owner = $this->playerAndCoupon();
        $case = $this->open($owner);
        $this->withToken($owner['token'])->postJson(
            '/api/v1/arcade/player/coupons/'.$owner['coupon_id'].'/acknowledge')
            ->assertOk();
        DB::transaction(function () use ($owner): void {
            DB::table('arcade_players')->where('id', $owner['player_id'])
                ->lockForUpdate()->first();
            app(CouponIssuanceService::class)
                ->revokeForDeletedPlayer($owner['player_id']);
            DB::table('arcade_players')->where('id', $owner['player_id'])->delete();
        });
        $this->assertDatabaseHas('arcade_coupon_disputes', [
            'id' => $case['case_id'], 'player_id' => null,
            'description' => null, 'open_coupon_id' => null,
        ]);
        $this->assertDatabaseHas('arcade_coupon_delivery_receipts', [
            'coupon_id' => $owner['coupon_id'], 'player_id' => null,
        ]);
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $owner['coupon_id'], 'player_id' => null,
            'status' => 'revoked', 'code_ciphertext' => null,
        ]);
    }
}
