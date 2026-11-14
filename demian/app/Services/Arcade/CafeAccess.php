<?php

namespace App\Services\Arcade;

/**
 * Explicit capabilities, never a numeric trust comparison.
 *
 * "3/10" admin is exactly three read-only permissions; "10/10"
 * super_admin has all ten. Cashier and manager remain distinct operating
 * roles from Phase 9, so admin does NOT gain checkout authority.
 */
final class CafeAccess
{
    public const CAPABILITIES = [
        'coupon.lookup',
        'report.branch',
        'staff.directory',
        'coupon.redeem',
        'report.global',
        'staff.disable',
        'staff.enable',
        'coupon.revoke',
        'audit.ledger',
        'operations.readiness',
    ];

    private const ROLES = [
        'cashier' => ['coupon.lookup', 'coupon.redeem'],
        'manager' => ['coupon.lookup', 'coupon.redeem', 'report.branch'],
        'admin' => ['coupon.lookup', 'report.branch', 'staff.directory'],
        'super_admin' => self::CAPABILITIES,
    ];

    public static function knownRole(string $role): bool
    {
        return array_key_exists($role, self::ROLES);
    }

    public static function abilities(string $role): array
    {
        return self::ROLES[$role] ?? [];
    }

    public static function allows(?object $staff, string $ability): bool
    {
        return $staff !== null
            && (bool) ($staff->is_active ?? false)
            && in_array($ability, self::CAPABILITIES, true)
            && in_array($ability, self::abilities((string) ($staff->role ?? '')), true);
    }

    public static function authorize(?object $staff, string $ability): void
    {
        abort_unless(self::allows($staff, $ability), 403, 'Insufficient cafe permissions.');
    }
}
