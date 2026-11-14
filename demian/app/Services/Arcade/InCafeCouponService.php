<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;
use App\Services\Arcade\CafeAccess;
use RuntimeException;

/**
 * Single authoritative in-person redemption path. No merchant API, online
 * reservation, payment gateway or user bearer token is trusted for spending.
 */
final class InCafeCouponService
{
    private function enabled(): void
    {
        abort_unless(config('demian-coupons.cafe_enabled') === true
            && config('demian-coupons.policy_approved') === true,
            503, 'In-cafe redemption has not been enabled.');
    }

    private function receiptHash(string $branch, string $ticket): string
    {
        $key = config('demian-coupons.cafe_receipt_hash_key');
        abort_unless(is_string($key) && strlen($key) >= 32, 503,
            'Cash register receipt protection is not configured.');

        return hash_hmac('sha256', $branch."\n".$ticket, $key);
    }

    private function coupon(string $code, bool $lock): ?object
    {
        $query = DB::table('arcade_coupons')->where('code_hash', hash('sha256', $code));
        return ($lock ? $query->lockForUpdate() : $query)->first();
    }

    private function state(object $coupon): string
    {
        if ($coupon->status === 'redeemed') return 'redeemed';
        if ($coupon->status === 'revoked' || ! $coupon->player_id) return 'revoked';
        if ($coupon->expires_at <= now()->utc()->toDateTimeString()) return 'expired';
        if ($coupon->status !== 'issued') return 'unavailable';
        return 'valid';
    }

    public function inspect(string $code): array
    {
        $this->enabled();
        $coupon = $this->coupon($code, false);
        abort_unless($coupon, 422, 'Code not found.');
        return [
            'state' => $this->state($coupon),
            'percent' => (int) $coupon->discount_percent,
            'currency' => $coupon->currency,
            'minimum_minor' => (int) $coupon->min_order_minor,
            'cap_minor' => (int) $coupon->max_discount_minor,
            'expires_at' => $coupon->expires_at,
            'code_suffix' => substr($code, -4),
        ];
    }

    private function discount(object $coupon, int $subtotal): int
    {
        abort_unless($subtotal >= (int) $coupon->min_order_minor
            && $subtotal <= 1000000000000, 422,
            'Bill does not satisfy the voucher terms.');
        $percent = (int) $coupon->discount_percent;
        // Integer-only minor units, avoids rounding and float drift.
        return min(
            intdiv($subtotal, 100) * $percent + intdiv(($subtotal % 100) * $percent, 100),
            (int) $coupon->max_discount_minor,
        );
    }

    /**
     * Receipt numbers are cafe-local non-PII references, never raw PII.
     * The same request key may safely be retried by the same cashier with the
     * exact same code, bill and receipt. Every other second spend is rejected.
     */
    public function redeem(int $cashierId, string $code, string $ticket,
        int $subtotal, string $requestKey): array
    {
        $this->enabled();

        try {
            return DB::transaction(function () use ($cashierId, $code, $ticket,
                $subtotal, $requestKey): array {
            // Staff lock first; suspending the cashier waits for any in-flight
            // spend, and the next request always observes the suspension.
            $cashier = DB::table('arcade_cashier_staff')->where('id', $cashierId)
                ->lockForUpdate()->first();
            abort_unless(CafeAccess::allows($cashier, 'coupon.redeem'),
                403, 'Inactive cashier credentials.');

            $ticketHash = $this->receiptHash($cashier->branch_id, $ticket);
            $coupon = $this->coupon($code, true);
            abort_unless($coupon, 422, 'Code not found.');

            $previous = DB::table('arcade_cashier_requests')
                ->where('request_key', $requestKey)->first();
            if ($previous) {
                abort_unless((int) $previous->coupon_id === (int) $coupon->id
                    && (int) $previous->cashier_id === $cashierId
                    && hash_equals($previous->ticket_hash, $ticketHash)
                    && (int) $previous->subtotal_minor === $subtotal,
                    409, 'Request identifier cannot be reused for a different sale.');
                $receipt = DB::table('arcade_coupon_redemptions')
                    ->where('id', $previous->redemption_id)->first();
                abort_unless($receipt && $receipt->channel === 'in_cafe', 409);
                return $this->result($receipt, true);
            }

            abort_unless($this->state($coupon) === 'valid', 409,
                'Coupon is expired, revoked, reserved or already redeemed.');
            $discount = $this->discount($coupon, $subtotal);
            abort_unless($discount > 0, 422, 'Discount amount is zero.');
            // Same physical bill can never claim another coupon, irrespective
            // of cashier identity. Unique SQL order_hash enforces this.
            abort_if(DB::table('arcade_coupon_redemptions')->where('order_hash', $ticketHash)
                ->exists(), 409, 'This cafe receipt already has a voucher.');
            $now = now()->utc()->toDateTimeString();
            $receiptId = DB::table('arcade_coupon_redemptions')->insertGetId([
                'coupon_id' => $coupon->id, 'reservation_id' => null,
                'order_hash' => $ticketHash, 'channel' => 'in_cafe',
                'cashier_id' => $cashierId, 'branch_id' => $cashier->branch_id,
                'currency' => $coupon->currency, 'subtotal_minor' => $subtotal,
                'discount_minor' => $discount, 'redeemed_at' => $now,
            ]);
            DB::table('arcade_coupons')->where('id', $coupon->id)->update([
                'status' => 'redeemed', 'redeemed_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('arcade_cashier_requests')->insert([
                'request_key' => $requestKey, 'coupon_id' => $coupon->id,
                'cashier_id' => $cashierId, 'redemption_id' => $receiptId,
                'ticket_hash' => $ticketHash, 'subtotal_minor' => $subtotal,
                'created_at' => $now,
            ]);
            DB::table('arcade_coupon_events')->insert([
                'coupon_id' => $coupon->id, 'event_type' => 'redeemed_in_cafe',
                'shop_event_id' => null, 'order_hash' => $ticketHash,
                'details' => json_encode([
                    'cashier_id' => $cashierId, 'branch_id' => $cashier->branch_id,
                    'percent' => (int) $coupon->discount_percent,
                    'discount_minor' => $discount, 'currency' => $coupon->currency,
                ], JSON_THROW_ON_ERROR),
                'created_at' => $now,
            ]);

            $receipt = DB::table('arcade_coupon_redemptions')->where('id', $receiptId)->first();
            return $this->result($receipt, false);
            }, 3);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Even if two PHP workers raced past prechecks, the DB unique
            // indexes are authoritative; surface a safe HTTP conflict.
            abort(409, 'Coupon or cafe receipt has already been used.');
        }
    }

    private function result(object $receipt, bool $retried): array
    {
        return [
            'status' => 'redeemed',
            'receipt_id' => (int) $receipt->id,
            'discount_minor' => (int) $receipt->discount_minor,
            'subtotal_minor' => (int) $receipt->subtotal_minor,
            'currency' => $receipt->currency,
            'redeemed_at' => $receipt->redeemed_at,
            'idempotent_replay' => $retried,
        ];
    }

    public function recent(string $branch, int $limit = 50): array
    {
        $this->enabled();
        return DB::table('arcade_coupon_redemptions as r')
            ->join('arcade_cashier_staff as s', 's.id', '=', 'r.cashier_id')
            ->where('r.channel', 'in_cafe')->where('r.branch_id', $branch)
            ->orderByDesc('r.id')->limit(max(1, min($limit, 100)))
            ->get(['r.id', 'r.currency', 'r.subtotal_minor', 'r.discount_minor',
                'r.redeemed_at', 's.display_name as cashier'])
            ->map(static fn (object $r): array => [
                'id' => $r->id, 'currency' => $r->currency,
                'subtotal_minor' => $r->subtotal_minor,
                'discount_minor' => $r->discount_minor,
                'redeemed_at' => $r->redeemed_at, 'cashier' => $r->cashier,
            ])->all();
    }
}
