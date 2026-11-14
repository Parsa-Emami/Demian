<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Store operations are invoked only after HMAC request authentication.
 * A DB lock on coupon (after account lock) serializes all state changes.
 */
final class CouponLifecycleService
{
    private function merchant(): string
    {
        abort_unless(config('demian-coupons.store_enabled'), 503, 'Store redemption is disabled.');
        $id = config('demian-coupons.store_id');
        abort_unless(is_string($id) && preg_match('/^[A-Za-z0-9._-]{1,40}$/D', $id),
            503, 'Store integration is not configured.');

        return $id;
    }

    private function coupon(string $code, string $playerId, bool $lock = false): object
    {
        $query = DB::table('arcade_coupons')->where('code_hash', hash('sha256', $code));
        $row = ($lock ? $query->lockForUpdate() : $query)->first();
        abort_unless($row && $row->player_id === $playerId, 422,
            'Invalid or unavailable coupon.');

        return $row;
    }

    private function checkQuote(object $coupon, int $total, string $currency): int
    {
        abort_unless($coupon->status !== 'redeemed' && $coupon->status !== 'revoked'
            && $coupon->expires_at > now()->utc()->toDateTimeString()
            && $currency === $coupon->currency
            && $total > 0 && $total <= 1000000000 && $total >= (int) $coupon->minimum_minor,
            422, 'Invalid or unavailable coupon.');

        $discount = min((int) $coupon->cap_minor,
            intdiv($total * (int) $coupon->percent_off, 100));
        abort_unless($discount > 0 && $discount <= $total, 422,
            'Invalid or unavailable coupon.');

        return $discount;
    }

    private function event(int $couponId, string $event, string $actor,
        ?string $orderId = null, array $details = []): void
    {
        DB::table('arcade_coupon_events')->insert([
            'coupon_id' => $couponId, 'event_type' => $event, 'actor' => $actor,
            // Keep external order identifiers out of audit details.
            'order_digest' => $orderId === null ? null : hash('sha256', $orderId),
            'details' => json_encode($details, JSON_THROW_ON_ERROR),
            'created_at' => now()->utc()->toDateTimeString(),
        ]);
    }

    private function accountLock(string $playerId): void
    {
        abort_unless(DB::table('arcade_players')->where('id', $playerId)
            ->lockForUpdate()->first(['id']) !== null, 422, 'Invalid or unavailable coupon.');
    }

    /**
     * @return array{currency:string,percent_off:int,discount_minor:int,order_total_minor:int}
     */
    public function quote(string $code, string $playerId, int $total, string $currency): array
    {
        $this->merchant();
        $coupon = $this->coupon($code, $playerId);
        abort_unless($coupon->status === 'available', 409, 'Coupon is reserved or consumed.');

        return $this->summary($coupon, $total, $this->checkQuote($coupon, $total, $currency));
    }

    private function summary(object $coupon, int $total, int $discount): array
    {
        return ['currency' => $coupon->currency, 'percent_off' => (int) $coupon->percent_off,
            'discount_minor' => $discount, 'order_total_minor' => $total];
    }

    public function reserve(string $code, string $playerId, string $orderId,
        int $total, string $currency): array
    {
        $merchant = $this->merchant();

        return DB::transaction(function () use ($code, $playerId, $orderId, $total, $currency, $merchant): array {
            $this->accountLock($playerId);
            $coupon = $this->coupon($code, $playerId, true);
            $previous = DB::table('arcade_coupon_reservations')
                ->where('merchant_id', $merchant)->where('order_id', $orderId)->first();
            if ($previous) {
                abort_unless((int) $previous->coupon_id === (int) $coupon->id
                    && (int) $previous->order_total_minor === $total
                    && $previous->currency === $currency, 409,
                    'Order identifier has already been used.');
                if ($previous->state === 'captured' && $coupon->status === 'redeemed') {
                    return ['status' => 'captured', ...$this->summary($coupon, $total,
                        (int) $previous->discount_minor)];
                }
                abort_unless($previous->state === 'reserved'
                    && $coupon->status === 'reserved'
                    && $previous->expires_at > now()->utc()->toDateTimeString()
                    && $coupon->expires_at > now()->utc()->toDateTimeString(), 409,
                    'Order identifier is no longer reservable.');

                return ['status' => 'reserved', 'reserve_expires_at' => $previous->expires_at,
                    ...$this->summary($coupon, $total, (int) $previous->discount_minor)];
            }
            $discount = $this->checkQuote($coupon, $total, $currency);

            if ($coupon->status === 'reserved') {
                $active = DB::table('arcade_coupon_reservations')
                    ->where('coupon_id', $coupon->id)->where('state', 'reserved')
                    ->orderByDesc('id')->lockForUpdate()->first();
                abort_unless($active, 409, 'Coupon reservation state is inconsistent.');
                abort_if($active->expires_at > now()->utc()->toDateTimeString(), 409,
                    'Coupon is reserved by another order.');
                DB::table('arcade_coupon_reservations')->where('id', $active->id)
                    ->update(['state' => 'expired', 'updated_at' => now()]);
                $this->event((int) $coupon->id, 'reservation_expired', 'system', $active->order_id);
            } else {
                abort_unless($coupon->status === 'available', 409, 'Coupon cannot be reserved.');
            }

            $expires = now()->utc()->addMinutes((int) config('demian-coupons.reserve_minutes', 15));
            // An order id is unique even after release or expiration. This
            // prevents one paid order being recycled for multiple coupons.
            try {
                DB::table('arcade_coupon_reservations')->insert([
                    'coupon_id' => $coupon->id, 'merchant_id' => $merchant,
                    'order_id' => $orderId, 'state' => 'reserved',
                    'currency' => $currency, 'order_total_minor' => $total,
                    'discount_minor' => $discount, 'expires_at' => $expires->toDateTimeString(),
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
                abort(409, 'Order identifier has already been used.');
            }
            DB::table('arcade_coupons')->where('id', $coupon->id)
                ->update(['status' => 'reserved', 'updated_at' => now()]);
            $this->event((int) $coupon->id, 'reserved', 'store', $orderId,
                ['discount_minor' => $discount, 'currency' => $currency]);

            return ['status' => 'reserved', 'reserve_expires_at' => $expires->toDateTimeString(),
                ...$this->summary($coupon, $total, $discount)];
        }, 3);
    }

    public function capture(string $code, string $playerId, string $orderId,
        int $total, string $currency): array
    {
        $merchant = $this->merchant();

        return DB::transaction(function () use ($code, $playerId, $orderId, $total, $currency, $merchant): array {
            $this->accountLock($playerId);
            $coupon = $this->coupon($code, $playerId, true);
            $reservation = DB::table('arcade_coupon_reservations')
                ->where('merchant_id', $merchant)->where('order_id', $orderId)
                ->lockForUpdate()->first();
            abort_unless($reservation && (int) $reservation->coupon_id === (int) $coupon->id
                && (int) $reservation->order_total_minor === $total
                && $reservation->currency === $currency, 409, 'Unknown or changed order.');

            if ($reservation->state === 'captured' && $coupon->status === 'redeemed') {
                return ['status' => 'captured', ...$this->summary($coupon, $total,
                    (int) $reservation->discount_minor)];
            }

            abort_unless($reservation->state === 'reserved' && $coupon->status === 'reserved'
                && $coupon->expires_at > now()->utc()->toDateTimeString()
                && $reservation->expires_at > now()->utc()->toDateTimeString()
                && $this->checkQuote($coupon, $total, $currency) === (int) $reservation->discount_minor,
                409, 'Reservation expired or already consumed.');

            DB::table('arcade_coupon_reservations')->where('id', $reservation->id)
                ->update(['state' => 'captured', 'captured_at' => now(), 'updated_at' => now()]);
            DB::table('arcade_coupons')->where('id', $coupon->id)
                ->update(['status' => 'redeemed', 'redeemed_at' => now(), 'updated_at' => now()]);
            $this->event((int) $coupon->id, 'captured', 'store', $orderId,
                ['discount_minor' => (int) $reservation->discount_minor]);

            return ['status' => 'captured', ...$this->summary($coupon, $total,
                (int) $reservation->discount_minor)];
        }, 3);
    }

    public function release(string $code, string $playerId, string $orderId): array
    {
        $merchant = $this->merchant();

        return DB::transaction(function () use ($code, $playerId, $orderId, $merchant): array {
            $this->accountLock($playerId);
            $coupon = $this->coupon($code, $playerId, true);
            $reservation = DB::table('arcade_coupon_reservations')
                ->where('merchant_id', $merchant)->where('order_id', $orderId)
                ->lockForUpdate()->first();
            abort_unless($reservation && (int) $reservation->coupon_id === (int) $coupon->id,
                409, 'Unknown order.');
            abort_if($reservation->state === 'captured', 409,
                'Captured coupon requires an audited refund process.');
            if (in_array($reservation->state, ['released', 'expired'], true)) {
                return ['status' => $reservation->state];
            }
            abort_unless($reservation->state === 'reserved', 409, 'Invalid reservation state.');

            DB::table('arcade_coupon_reservations')->where('id', $reservation->id)
                ->update(['state' => 'released', 'updated_at' => now()]);
            if ($coupon->status === 'reserved') {
                DB::table('arcade_coupons')->where('id', $coupon->id)
                    ->update(['status' => 'available', 'updated_at' => now()]);
            }
            $this->event((int) $coupon->id, 'released', 'store', $orderId);

            return ['status' => 'released'];
        }, 3);
    }

    public function myCoupons(string $playerId): array
    {
        return DB::table('arcade_coupons')->where('player_id', $playerId)
            ->orderByDesc('id')->get()->map(function (object $row): array {
                $available = $row->code_ciphertext !== null
                    && in_array($row->status, ['available', 'reserved'], true)
                    && $row->expires_at > now()->utc()->toDateTimeString();
                return [
                    'coupon_id' => (int) $row->id, 'period_key' => $row->period_key,
                    'game_id' => $row->game_id, 'prize_rank' => (int) $row->prize_rank,
                    'percent_off' => (int) $row->percent_off, 'currency' => $row->currency,
                    'minimum_minor' => (int) $row->minimum_minor,
                    'cap_minor' => (int) $row->cap_minor, 'expires_at' => $row->expires_at,
                    'status' => $row->expires_at <= now()->utc()->toDateTimeString()
                        && $row->status !== 'redeemed' && $row->status !== 'revoked'
                        ? 'expired' : $row->status,
                    'code' => $available ? Crypt::decryptString($row->code_ciphertext) : null,
                ];
            })->all();
    }

    /**
     * Call under the player's row lock and before deleting the player.
     * Account erasure revokes every unspent bearer capability.
     */
    public function revokeForErasure(string $playerId): void
    {
        $rows = DB::table('arcade_coupons')->where('player_id', $playerId)
            ->orderBy('id')->lockForUpdate()->get();
        foreach ($rows as $coupon) {
            DB::table('arcade_coupon_reservations')->where('coupon_id', $coupon->id)
                ->where('state', 'reserved')->update(['state' => 'released', 'updated_at' => now()]);
            DB::table('arcade_coupons')->where('id', $coupon->id)->update([
                'status' => $coupon->status === 'redeemed' ? 'redeemed' : 'revoked',
                'code_ciphertext' => null, 'updated_at' => now(),
            ]);
            $this->event((int) $coupon->id, 'account_erased', 'system');
        }
    }

    /** Operator incident response; never silently re-credit captured payments. */
    public function revoke(int $couponId, string $reason): array
    {
        if (! in_array($reason, ['fraud', 'policy', 'incident'], true)) {
            throw new \InvalidArgumentException('Invalid coupon revocation reason.');
        }

        return DB::transaction(function () use ($couponId, $reason): array {
            $coupon = DB::table('arcade_coupons')->where('id', $couponId)->lockForUpdate()->first();
            if (! $coupon) {
                throw new RuntimeException('Coupon record does not exist.');
            }
            if ($coupon->status === 'redeemed') {
                throw new RuntimeException('Captured discount requires a separate audited refund.');
            }
            if ($coupon->status === 'revoked') {
                return ['coupon_id' => $couponId, 'status' => 'already_revoked'];
            }

            DB::table('arcade_coupon_reservations')->where('coupon_id', $couponId)
                ->where('state', 'reserved')->update([
                    'state' => 'released', 'updated_at' => now(),
                ]);
            DB::table('arcade_coupons')->where('id', $couponId)->update([
                'status' => 'revoked', 'code_ciphertext' => null, 'updated_at' => now(),
            ]);
            $this->event($couponId, 'revoked', 'operator', null, ['reason' => $reason]);

            return ['coupon_id' => $couponId, 'status' => 'revoked'];
        }, 3);
    }

}
