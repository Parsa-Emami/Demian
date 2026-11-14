<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;

/**
 * Privileged staff operations. There is NO browser endpoint to create roles or
 * promote anyone to super_admin. Bootstrap is a separate SSH-only operation.
 */
final class CafeStaffAdminService
{
    public function setActive(int $actorId, int $sessionVersion, int $subjectId,
        bool $enabled): array
    {
        return DB::transaction(function () use ($actorId, $sessionVersion, $subjectId, $enabled): array {
            $actor = DB::table('arcade_cashier_staff')->where('id', $actorId)
                ->lockForUpdate()->first();
            CafeAccess::authorize($actor, $enabled ? 'staff.enable' : 'staff.disable');
            abort_unless((int) $actor->session_version === $sessionVersion, 403,
                'Administrative session changed.');
            $subject = DB::table('arcade_cashier_staff')->where('id', $subjectId)
                ->lockForUpdate()->first();
            abort_unless($subject && CafeAccess::knownRole($subject->role), 404);

            // Super-admin accounts cannot be deactivated or demoted through
            // the browser (even by another super_admin). SSH recovery only.
            abort_unless($subject->role !== 'super_admin', 403,
                'Super administrator accounts require offline recovery.');
            if ((bool) $subject->is_active === $enabled) {
                return ['status' => 'unchanged', 'id' => $subjectId];
            }
            DB::table('arcade_cashier_staff')->where('id', $subjectId)->update([
                'is_active' => $enabled,
                'session_version' => (int) $subject->session_version + 1,
                'updated_at' => now(),
            ]);
            DB::table('arcade_cashier_admin_events')->insert([
                'actor_id' => $actorId, 'subject_id' => $subjectId,
                'event_type' => $enabled ? 'staff_enabled' : 'staff_disabled',
                'details' => json_encode(['role' => $subject->role,
                    'branch' => $subject->branch_id], JSON_THROW_ON_ERROR),
                'created_at' => now(),
            ]);

            return ['status' => $enabled ? 'enabled' : 'disabled', 'id' => $subjectId];
        }, 3);
    }

    public function revokeCoupon(int $actorId, int $sessionVersion,
        int $couponId, string $reason): array
    {
        return DB::transaction(function () use ($actorId, $sessionVersion, $couponId, $reason): array {
            $actor = DB::table('arcade_cashier_staff')->where('id', $actorId)
                ->lockForUpdate()->first();
            CafeAccess::authorize($actor, 'coupon.revoke');
            abort_unless((int) $actor->session_version === $sessionVersion, 403,
                'Administrative session changed.');
            $result = app(CouponIssuanceService::class)->revoke($couponId, $reason);
            if ($result['status'] === 'revoked') {
                DB::table('arcade_cashier_admin_events')->insert([
                    'actor_id' => $actorId, 'subject_id' => null,
                    'event_type' => 'coupon_revoked',
                    'details' => json_encode(['coupon_id' => $couponId,
                        'reason' => $reason], JSON_THROW_ON_ERROR),
                    'created_at' => now(),
                ]);
            }

            return $result;
        }, 3);
    }
}
