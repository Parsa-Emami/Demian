<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CafeProductionReadiness;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CafePhase10AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'StrongPassword123!';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        config()->set('demian-coupons.cafe_enabled', true);
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.cafe_receipt_hash_key', str_repeat('x', 48));
    }

    private function staff(string $role, string $branch = 'cafe-main'): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'staff'.Str::lower(Str::random(11)),
            'display_name' => 'Cafe Staff',
            'password_hash' => Hash::make(self::PASSWORD),
            'branch_id' => $branch, 'role' => $role, 'is_active' => true,
            'session_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function asStaff(int $id): static
    {
        $staff = DB::table('arcade_cashier_staff')->where('id', $id)->first();
        return $this->withSession([
            'cafe_staff_id' => $id, 'cafe_staff_version' => (int) $staff->session_version,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
    }

    private function voucher(): array
    {
        $player = (string) Str::uuid();
        $run = (string) Str::uuid();
        $code = 'DMC-'.strtoupper(bin2hex(random_bytes(16)));
        DB::table('arcade_players')->insert([
            'id' => $player, 'display_name' => 'Prize Winner',
            'token_hash' => hash('sha256', $player),
            'token_expires_at' => now()->addDay(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_runs')->insert([
            'id' => $run, 'player_id' => $player, 'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
            'character_slug' => 'darya', 'seed' => 1, 'track_width' => 420,
            'status' => 'verified', 'score' => 900, 'ticks' => 120, 'passed' => 1,
            'replay_hash' => hash('sha256', $run),
            'started_at' => '2026-11-10 10:00:00', 'expires_at' => '2026-11-10 11:00:00',
            'completed_at' => '2026-11-10 10:05:00',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_weekly_periods')->insert([
            'period_key' => 'weekly:tehran:2026-11-07',
            'starts_at' => '2026-11-06 20:30:00',
            'ends_at' => '2026-11-13 20:30:00',
            'status' => 'sealed', 'sealed_at' => '2026-11-13 21:00:00',
            'participants' => 1, 'winner_count' => 1,
            'snapshot_hash' => str_repeat('a', 64),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $winner = DB::table('arcade_weekly_winners')->insertGetId([
            'period_key' => 'weekly:tehran:2026-11-07', 'game_id' => 'dino-run',
            'rules_version' => 'cafe-runner-v2', 'player_id' => $player, 'run_id' => $run,
            'score' => 900, 'achieved_at' => '2026-11-10 10:00:00',
            'technical_rank' => 1, 'prize_rank' => 1,
            'previous_winner' => false, 'created_at' => now(),
        ]);
        $id = DB::table('arcade_coupons')->insertGetId([
            'winner_id' => $winner, 'player_id' => $player,
            'code_hash' => hash('sha256', $code),
            'code_ciphertext' => Crypt::encryptString($code),
            'policy_version' => 'cafe-1', 'discount_percent' => 30,
            'currency' => 'IRR', 'min_order_minor' => 1000,
            'max_discount_minor' => 5000,
            'status' => 'issued', 'active_reservation_id' => null,
            'issued_at' => now(), 'expires_at' => now()->addDays(30),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_coupon_events')->insert([
            'coupon_id' => $id, 'event_type' => 'issued',
            'shop_event_id' => null, 'order_hash' => null,
            'details' => json_encode(['origin' => 'phase10-fixture'], JSON_THROW_ON_ERROR),
            'created_at' => now(),
        ]);

        return ['id' => $id, 'code' => $code];
    }

    public function test_admin_is_exactly_three_permissions_and_superadmin_has_ten(): void
    {
        $this->assertCount(10, CafeAccess::CAPABILITIES);
        $this->assertSame(['coupon.lookup', 'report.branch', 'staff.directory'],
            CafeAccess::abilities('admin'));
        $this->assertCount(3, CafeAccess::abilities('admin'));
        $this->assertSame(CafeAccess::CAPABILITIES, CafeAccess::abilities('super_admin'));
        $this->assertCount(10, CafeAccess::abilities('super_admin'));
        $this->assertSame([], CafeAccess::abilities('unknown'));
        $this->assertFalse(CafeAccess::knownRole('root'));
        $this->assertSame(['coupon.lookup', 'coupon.redeem'],
            CafeAccess::abilities('cashier'));
        $this->assertSame(['coupon.lookup', 'coupon.redeem', 'report.branch'],
            CafeAccess::abilities('manager'));
    }

    public function test_admin_can_view_only_own_branch_and_has_no_financial_write_capability(): void
    {
        $coupon = $this->voucher();
        $admin = $this->staff('admin');
        $inBranch = $this->staff('cashier');
        $other = $this->staff('cashier', 'cafe-other');
        $otherUsername = DB::table('arcade_cashier_staff')->where('id', $other)
            ->value('username');
        $ownUsername = DB::table('arcade_cashier_staff')->where('id', $inBranch)
            ->value('username');

        $this->asStaff($admin)->get('/cashier')->assertOk()
            ->assertSee('3 از ۱۰ مجوز')->assertDontSee('ابطال اضطراری کد');
        $this->get('/cashier/admin/staff')->assertOk()
            ->assertSee($ownUsername)->assertDontSee($otherUsername)
            ->assertDontSee('name="password"', false);
        $this->get('/cashier/report')->assertOk();
        $this->post('/cashier/lookup', ['code' => $coupon['code']])->assertOk()
            ->assertDontSee('ثبت قطعی مصرف کد');
        $this->post('/cashier/redeem', [
            'code' => $coupon['code'], 'ticket_ref' => 'ticket-001',
            'subtotal_minor' => 10000, 'request_key' => (string) Str::uuid(),
            'confirmed' => '1',
        ])->assertForbidden();
        $this->get('/cashier/admin/reports/global')->assertForbidden();
        $this->get('/cashier/admin/audit')->assertForbidden();
        $this->get('/cashier/admin/readiness')->assertForbidden();
        $this->post('/cashier/admin/coupons/revoke', [
            'coupon_id' => $coupon['id'], 'reason' => 'fraud',
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertForbidden();
        $this->post('/cashier/admin/staff/'.$inBranch.'/disable', [
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertForbidden();
        $this->assertDatabaseCount('arcade_cashier_requests', 0);
        $this->assertDatabaseCount('arcade_cashier_admin_events', 0);
        $this->assertDatabaseHas('arcade_coupons', ['id' => $coupon['id'],
            'status' => 'issued']);
    }

    public function test_superadmin_sees_global_reports_staff_audit_and_readiness(): void
    {
        $id = $this->staff('super_admin');
        $this->staff('cashier', 'cafe-other');
        $this->asStaff($id)->get('/cashier')->assertOk()
            ->assertSee('10 از ۱۰ مجوز')->assertSee('ابطال اضطراری کد');
        $this->get('/cashier/admin/staff')->assertOk()->assertSee('cafe-other');
        $this->get('/cashier/admin/reports/global')->assertOk()
            ->assertSee('گزارش مصرف همه شعب');
        $this->get('/cashier/admin/audit')->assertOk()->assertSee('ممیزی');
        $this->get('/cashier/admin/readiness')->assertOk()->assertSee('آمادگی');
    }

    public function test_superadmin_requires_password_stepup_to_change_staff_or_coupon(): void
    {
        $root = $this->staff('super_admin');
        $employee = $this->staff('cashier');
        $this->asStaff($root)->post('/cashier/admin/staff/'.$employee.'/disable', [
            'password' => 'wrong-password', 'confirmed' => '1',
        ])->assertForbidden();
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $employee, 'is_active' => true, 'session_version' => 1,
        ]);
        $this->post('/cashier/admin/staff/'.$employee.'/disable', [
            'password' => self::PASSWORD,
        ])->assertSessionHasErrors('confirmed');
        $this->assertDatabaseCount('arcade_cashier_admin_events', 0);
    }

    public function test_superadmin_can_suspend_and_reenable_staff_with_auditable_session_revocation(): void
    {
        $root = $this->staff('super_admin');
        $employee = $this->staff('cashier');
        $this->asStaff($root)->post('/cashier/admin/staff/'.$employee.'/disable', [
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertRedirect(route('cashier.staff'));
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $employee, 'is_active' => false, 'session_version' => 2,
        ]);
        $this->assertDatabaseHas('arcade_cashier_admin_events', [
            'actor_id' => $root, 'subject_id' => $employee,
            'event_type' => 'staff_disabled',
        ]);
        $this->asStaff($employee)->get('/cashier')->assertRedirect(route('cashier.login'));
        $this->asStaff($root)->post('/cashier/admin/staff/'.$employee.'/enable', [
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertRedirect(route('cashier.staff'));
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $employee, 'is_active' => true, 'session_version' => 3,
        ]);
        $this->assertDatabaseCount('arcade_cashier_admin_events', 2);
    }

    public function test_browser_cannot_disable_a_superadmin_even_from_another_superadmin(): void
    {
        $root = $this->staff('super_admin');
        $other = $this->staff('super_admin');
        $this->asStaff($root)->post('/cashier/admin/staff/'.$other.'/disable', [
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertForbidden();
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $other, 'is_active' => true,
        ]);
    }

    public function test_cli_superadmin_promotion_requires_explicit_operator_acknowledgement(): void
    {
        $user = $this->staff('admin');
        $username = DB::table('arcade_cashier_staff')->where('id', $user)
            ->value('username');
        $this->artisan('arcade:cashier:staff', [
            'action' => 'set-role', '--username' => $username,
            '--role' => 'super_admin', '--apply' => true,
        ])->assertFailed();
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $user, 'role' => 'admin', 'session_version' => 1,
        ]);
        $this->artisan('arcade:cashier:staff', [
            'action' => 'set-role', '--username' => $username, '--role' => 'super_admin',
            '--apply' => true, '--ack-super-admin' => true,
        ])->assertSuccessful();
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $user, 'role' => 'super_admin', 'session_version' => 2,
        ]);
        $this->assertDatabaseHas('arcade_cashier_admin_events', [
            'subject_id' => $user, 'event_type' => 'cli_set-role',
        ]);
    }

    public function test_last_active_superadmin_cannot_be_demoted_or_disabled_by_cli(): void
    {
        $root = $this->staff('super_admin');
        $username = DB::table('arcade_cashier_staff')->where('id', $root)
            ->value('username');
        $this->artisan('arcade:cashier:staff', [
            'action' => 'set-role', '--username' => $username,
            '--role' => 'admin', '--apply' => true, '--ack-super-admin' => true,
        ])->assertFailed();
        $this->artisan('arcade:cashier:staff', [
            'action' => 'disable', '--username' => $username,
            '--apply' => true, '--ack-super-admin' => true,
        ])->assertFailed();
        $this->assertDatabaseHas('arcade_cashier_staff', [
            'id' => $root, 'is_active' => true, 'role' => 'super_admin',
        ]);
        $this->assertDatabaseCount('arcade_cashier_admin_events', 0);
    }

    public function test_superadmin_revokes_an_unspent_coupon_with_audit_and_never_reissues(): void
    {
        $root = $this->staff('super_admin');
        $coupon = $this->voucher();
        $this->asStaff($root)->post('/cashier/admin/coupons/revoke', [
            'coupon_id' => $coupon['id'], 'reason' => 'fraud',
            'password' => self::PASSWORD, 'confirmed' => '1',
        ])->assertRedirect(route('cashier.index'));
        $this->assertDatabaseHas('arcade_coupons', [
            'id' => $coupon['id'], 'status' => 'revoked', 'code_ciphertext' => null,
        ]);
        $this->assertDatabaseHas('arcade_cashier_admin_events', [
            'actor_id' => $root, 'event_type' => 'coupon_revoked',
        ]);
        $this->assertDatabaseHas('arcade_coupon_events', [
            'coupon_id' => $coupon['id'], 'event_type' => 'revoked',
        ]);
        $this->assertDatabaseCount('arcade_coupon_redemptions', 0);
    }

    public function test_readiness_fails_closed_without_live_approvals_and_superadmin(): void
    {
        $result = app(CafeProductionReadiness::class)->inspect(true);
        $this->assertSame('failed', $result['status']);
        $this->assertSame('live_activation', $result['mode']);
        $checks = collect($result['checks'])->keyBy('check');
        $this->assertFalse($checks['active_superadmin']['passed']);
        $this->assertTrue($checks['receipt_hmac_key_present']['passed']);
        $this->artisan('arcade:cafe:preflight', [
            '--target' => 'production', '--require-live' => true, '--json' => true,
        ])->assertFailed();
        $this->assertDatabaseCount('arcade_cashier_admin_events', 0);
    }

    public function test_phase10_deployment_contract_verifies_checks_before_switching_release(): void
    {
        $script = file_get_contents(base_path('ops/cpanel/deploy.sh'));
        $this->assertNotFalse($script);
        $this->assertStringContainsString('arcade:cafe:preflight', $script);
        $this->assertStringContainsString('arcade:audit-coupons --json', $script);
        $this->assertStringContainsString('--require-live', $script);
        $this->assertLessThan(
            strpos($script, 'switch_to "$release"'),
            strpos($script, 'arcade:cafe:preflight'),
        );
        $this->assertStringContainsString('cashier/login', $script);
    }
}
