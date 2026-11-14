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
            if ($coupon->source === 'gift') {
                $gift = DB::table('arcade_coupon_gifts')
                    ->where('id', $coupon->gift_id)->first();
                if ($coupon->winner_id !== null || ! $gift
                    || $gift->request_digest === null
                    || ! preg_match('/^[a-f0-9]{64}$/D', $gift->request_digest)
                    || ($coupon->player_id !== null
                        && $gift->player_id !== $coupon->player_id)
                    || (int) $coupon->discount_percent < 1
                    || (int) $coupon->discount_percent > 30
                    || (int) $coupon->min_order_minor < 1
                    || (int) $coupon->max_discount_minor < 1
                    || $coupon->expires_at <= $coupon->issued_at
                    || ! DB::table('arcade_cashier_staff')
                        ->where('id', $gift?->issuer_id)->exists()
                    || ! DB::table('arcade_cashier_admin_events')
                        ->where('actor_id', $gift?->issuer_id)
                        ->where('event_type', 'coupon_gift_issued')
                        ->where('details->gift_id', $gift?->id)->exists()) {
                    $issues[] = "Coupon #{$id} has invalid manual gift provenance.";
                }
            } elseif ($coupon->source === 'weekly') {
                $winner = DB::table('arcade_weekly_winners')
                    ->where('id', $coupon->winner_id)->first();
                $period = $winner ? DB::table('arcade_weekly_periods')
                    ->where('period_key', $winner->period_key)->first() : null;
                if ($coupon->gift_id !== null || ! $winner || ! $period
                    || $period->status !== 'sealed'
                    || $period->snapshot_hash === null
                    || ($coupon->player_id !== null && $coupon->player_id !== $winner->player_id)
                    || ! isset($ranks[(int) ($winner->prize_rank ?? 0)])
                    || (int) $coupon->discount_percent !== $ranks[(int) ($winner->prize_rank ?? 0)]) {
                    $issues[] = "Coupon #{$id} has an invalid archived winner or policy.";
                }
            } else {
                $issues[] = "Coupon #{$id} has an unknown issuance source.";
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
                || ($status === 'redeemed' && $receipts->count() !== 1)
                || ($status === 'redeemed' && $receipts->first()?->channel === 'shop'
                    && ($committed->count() !== 1
                        || $receipts->first()?->order_hash !== $committed->first()?->order_hash))
                || ($status === 'redeemed' && $receipts->first()?->channel === 'in_cafe'
                    && ($committed->count() !== 0 || $active->count() !== 0
                        || $receipts->first()?->reservation_id !== null
                        || ! DB::table('arcade_cashier_requests')
                            ->where('coupon_id', $id)
                            ->where('redemption_id', $receipts->first()?->id)
                            ->where('cashier_id', $receipts->first()?->cashier_id)
                            ->where('ticket_hash', $receipts->first()?->order_hash)->exists()
                        || ! DB::table('arcade_cashier_staff')
                            ->where('id', $receipts->first()?->cashier_id)
                            ->where('branch_id', $receipts->first()?->branch_id)->exists()
                        || ! DB::table('arcade_coupon_events')
                            ->where('coupon_id', $id)
                            ->where('event_type', 'redeemed_in_cafe')->exists()))) {
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
            'manual_gifts' => DB::table('arcade_coupon_gifts')->count(),
            'redemptions' => DB::table('arcade_coupon_redemptions')->count(),
            'shop_events' => DB::table('arcade_coupon_shop_requests')->count(),
            'cafe_redemptions' => DB::table('arcade_coupon_redemptions')
                ->where('channel', 'in_cafe')->count(),
            'issues' => $issues,
        ];
    }
}
