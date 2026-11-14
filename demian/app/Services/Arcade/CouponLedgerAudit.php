<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Read-only verification without rendering vouchers, identifiers or secrets.
 * A failed audit MUST block merchant launch and automatic issuance.
 */
final class CouponLedgerAudit
{
    public function inspect(): array
    {
        $issues = [];
        $coupons = DB::table('arcade_coupons')->orderBy('id')->get();
        $ranks = [1 => 30, 2 => 20, 3 => 20, 4 => 10, 5 => 10,
            6 => 10, 7 => 10, 8 => 10, 9 => 10, 10 => 10];

        foreach ($coupons as $coupon) {
            $id = (int) $coupon->id;
            $winner = DB::table('arcade_weekly_winners')->where('id', $coupon->winner_id)->first();
            $period = $winner ? DB::table('arcade_weekly_periods')
                ->where('period_key', $winner->period_key)->first() : null;
            if (! $winner || ! $period || $period->status !== 'sealed'
                || $period->snapshot_hash === null
                || ($coupon->player_id !== null && $coupon->player_id !== $winner->player_id)
                || ! isset($ranks[(int) ($winner->prize_rank ?? 0)])
                || (int) $coupon->discount_percent !== $ranks[(int) ($winner->prize_rank ?? 0)]) {
                $issues[] = "Coupon #{$id} has an invalid archived winner or policy.";
            }
            $status = $coupon->status;
            if (! in_array($status, ['issued', 'reserved', 'redeemed', 'revoked'], true)) {
                $issues[] = "Coupon #{$id} has an unknown state.";
            }

            // Verify the encrypted capability without outputting it.
            if ($coupon->code_ciphertext !== null) {
                try {
                    $secret = Crypt::decryptString($coupon->code_ciphertext);
                    if (! preg_match('/^DMC-[A-F0-9]{32}$/D', $secret)
                        || ! hash_equals($coupon->code_hash, hash('sha256', $secret))) {
                        $issues[] = "Coupon #{$id} secret integrity mismatch.";
                    }
                } catch (\Throwable) {
                    $issues[] = "Coupon #{$id} cannot be decrypted.";
                }
            } elseif ($status !== 'revoked' && ! ($status === 'redeemed' && $coupon->player_id === null)) {
                $issues[] = "Coupon #{$id} has unexpected missing encrypted data.";
            }
            if ($status === 'revoked' && $coupon->code_ciphertext !== null) {
                $issues[] = "Revoked coupon #{$id} retains a recoverable secret.";
            }
            if ($coupon->player_id === null && in_array($status, ['issued', 'reserved'], true)) {
                $issues[] = "Erased player coupon #{$id} remains spendable.";
            }

            $holds = DB::table('arcade_coupon_reservations')
                ->where('coupon_id', $id)->get();
            $active = $holds->where('status', 'reserved');
            $committed = $holds->where('status', 'committed');
            $receipts = DB::table('arcade_coupon_redemptions')
                ->where('coupon_id', $id)->get();
            if ($active->count() > 1 || $committed->count() > 1 || $receipts->count() > 1
                || ($status === 'reserved'
                    && ($active->count() !== 1
                        || (int) $coupon->active_reservation_id !== (int) $active->first()?->id))
                || ($status === 'issued' && ($active->count() !== 0 || $receipts->count() !== 0))
                || ($status === 'revoked' && $active->count() !== 0)
                || ($status === 'redeemed'
                    && ($receipts->count() !== 1 || $committed->count() !== 1
                        || $receipts->first()?->order_hash !== $committed->first()?->order_hash))) {
                $issues[] = "Coupon #{$id} reservation/redemption ledger mismatch.";
            }
            if (! DB::table('arcade_coupon_events')->where('coupon_id', $id)
                ->where('event_type', 'issued')->exists()) {
                $issues[] = "Coupon #{$id} has no issuance audit event.";
            }
        }

        return [
            'status' => $issues ? 'failed' : 'passed',
            'coupons' => $coupons->count(),
            'redemptions' => DB::table('arcade_coupon_redemptions')->count(),
            'shop_events' => DB::table('arcade_coupon_shop_requests')->count(),
            'issues' => $issues,
        ];
    }
}
