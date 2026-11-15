<?php

namespace Tests\Stress;

use App\Services\Arcade\CouponDeliverySupportService;
use App\Services\Arcade\ManualCouponGiftService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CouponDeliveryConcurrentDecisionTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_mysql_staff_workers_replace_a_coupon_only_once(): void
    {
        if (DB::getDriverName() !== 'mysql' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires independent MySQL/InnoDB workers.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-14T02:00:00Z'));
        foreach (['policy_approved', 'cafe_enabled', 'manual_gifts_enabled',
            'delivery_support_enabled'] as $flag) {
            config()->set('demian-coupons.'.$flag, true);
        }
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.policy_version', 'race-support-v1');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        config()->set('demian-coupons.gift_recipient_daily_limit', 2);
        $player = (string) Str::uuid();
        DB::table('arcade_players')->insert([
            'id' => $player, 'display_name' => 'Concurrent Support',
            'token_hash' => hash('sha256', $player),
            'token_expires_at' => now()->addDays(30),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $staff = DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'concurrent-superadmin', 'display_name' => 'Super Admin',
            'password_hash' => Hash::make('StrongPassword123!'),
            'role' => 'super_admin', 'branch_id' => 'main-cafe',
            'session_version' => 1, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $gift = app(ManualCouponGiftService::class)->issue($staff, 1, [
            'request_key' => (string) Str::uuid(),
            'player_id' => $player, 'percent' => 10,
            'min_order_minor' => 1000, 'max_discount_minor' => 5000,
            'valid_days' => 30, 'reason' => 'campaign',
        ]);
        $case = app(CouponDeliverySupportService::class)->submit(
            $player, $gift['coupon_id'], [
                'request_key' => (string) Str::uuid(),
                'category' => 'invalid_code', 'description' => 'کد معتبر نیست',
            ]);
        DB::disconnect();
        $pids = [];
        $files = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $path = sys_get_temp_dir().'/demian-support-'.Str::uuid().'.json';
                $files[] = $path;
                $pid = pcntl_fork();
                if ($pid === -1) $this->fail('Unable to fork MySQL workers.');
                if ($pid === 0) {
                    DB::disconnect();
                    try {
                        $result = app(CouponDeliverySupportService::class)->decide(
                            $staff, 1, $case['case_id'], 'replaced',
                            'Validated customer complaint, equivalent compensation approved.'
                        );
                        file_put_contents($path, json_encode($result, JSON_THROW_ON_ERROR));
                        exit(0);
                    } catch (\Throwable $error) {
                        file_put_contents($path, json_encode([
                            'error' => get_class($error), 'message' => $error->getMessage(),
                        ], JSON_THROW_ON_ERROR));
                        exit(1);
                    }
                }
                $pids[] = $pid;
            }
            foreach ($pids as $pid) {
                pcntl_waitpid($pid, $status);
                $this->assertTrue(pcntl_wifexited($status));
                $this->assertSame(0, pcntl_wexitstatus($status));
            }
            $results = [];
            foreach ($files as $path) {
                $this->assertFileExists($path);
                $results[] = json_decode(file_get_contents($path),
                    true, flags: JSON_THROW_ON_ERROR);
            }
            $replays = array_column($results, 'idempotent_replay');
            sort($replays);
            $this->assertSame([false, true], $replays);
            DB::reconnect();
            $this->assertDatabaseCount('arcade_coupons', 2);
            $this->assertDatabaseCount('arcade_coupon_gifts', 2);
            $this->assertDatabaseHas('arcade_coupons', [
                'id' => $gift['coupon_id'], 'status' => 'revoked',
                'code_ciphertext' => null,
            ]);
            $this->assertDatabaseHas('arcade_coupon_disputes', [
                'id' => $case['case_id'], 'status' => 'resolved',
                'resolution' => 'replaced', 'open_coupon_id' => null,
            ]);
            $this->assertSame(1, DB::table('arcade_coupon_dispute_events')
                ->where('event_type', 'closed')->count());
        } finally {
            foreach ($files as $path) @unlink($path);
        }
    }
}
