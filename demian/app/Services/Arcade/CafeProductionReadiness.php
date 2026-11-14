<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Zero-write operational checks. Never return .env contents, keys or passwords.
 * A code deploy with financial features disabled is allowed; live activation
 * requires stronger controls and an independently reviewed physical pilot.
 */
final class CafeProductionReadiness
{
    public function inspect(bool $requireLive = false, ?string $target = null): array
    {
        $checks = [];
        $add = static function (string $key, bool $ok) use (&$checks): void {
            $checks[] = ['check' => $key, 'passed' => $ok];
        };
        $add('php_compatible', PHP_VERSION_ID >= 80300);
        $add('app_debug_off', config('app.debug') === false);
        $add('app_https_url', is_string(config('app.url'))
            && str_starts_with(config('app.url'), 'https://'));
        $add('environment_target', $target === null
            || (in_array($target, ['production', 'staging'], true)
                && app()->environment($target)));
        $add('api_isolated', config('demian-arcade.api_only') === true);
        $add('db_mysql', config('database.default') === 'mysql');
        $add('persistent_session', config('session.driver') === 'database');
        $add('secure_session_cookie', config('session.secure') === true);
        $add('shared_cache', in_array(config('cache.default'), ['database', 'redis'], true));
        $add('no_online_store', config('demian-coupons.shop_enabled') === false);
        $tables = ['arcade_cashier_staff', 'arcade_cashier_admin_events',
            'arcade_coupon_redemptions', 'arcade_coupon_events',
            'arcade_cashier_requests', 'arcade_coupons', 'arcade_weekly_periods'];
        try {
            DB::select('SELECT 1');
            $add('db_connection', true);
            $schemaReady = true;
            foreach ($tables as $table) {
                if (! Schema::hasTable($table)) {
                    $schemaReady = false;
                    break;
                }
            }
            $add('schema_migrated', $schemaReady);
            if ($schemaReady) {
                $unknown = DB::table('arcade_cashier_staff')->distinct()->pluck('role')
                    ->reject(static fn ($role): bool => CafeAccess::knownRole((string) $role))->count();
                $add('roles_known', $unknown === 0);
                $add('active_superadmin', ! $requireLive
                    || DB::table('arcade_cashier_staff')->where('role', 'super_admin')
                        ->where('is_active', true)->exists());
                $add('active_cashier', ! $requireLive
                    || DB::table('arcade_cashier_staff')->whereIn('role',
                        ['cashier', 'manager'])->where('is_active', true)->exists());
                if ($requireLive) {
                    $audit = app(CouponLedgerAudit::class)->inspect();
                    $add('coupon_ledger_clean', $audit['status'] === 'passed');
                }
            }
        } catch (\Throwable) {
            $add('db_connection', false);
            $add('schema_migrated', false);
        }

        if ($requireLive) {
            $add('cafe_enabled', config('demian-coupons.cafe_enabled') === true);
            $add('discount_policy_approved',
                config('demian-coupons.policy_approved') === true);
            $key = config('demian-coupons.cafe_receipt_hash_key');
            $add('receipt_hmac_key_present', is_string($key) && strlen($key) >= 32);
            if (config('demian-coupons.manual_gifts_enabled') === true) {
                try {
                    app(ManualCouponGiftService::class)->terms();
                    $add('manual_gift_policy_bounded', true);
                } catch (\Throwable) {
                    $add('manual_gift_policy_bounded', false);
                }
            }
        }
        $ok = count(array_filter($checks, static fn (array $x): bool => ! $x['passed'])) === 0;

        return [
            'status' => $ok ? 'passed' : 'failed',
            'mode' => $requireLive ? 'live_activation' : 'deployment',
            'checks' => $checks,
        ];
    }
}
