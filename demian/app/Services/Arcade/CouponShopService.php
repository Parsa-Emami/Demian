<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Merchant-only signed checkout protocol: quote -> reserve -> commit/cancel.
 * All state changes, idempotency outcomes and audit events commit atomically.
 */
final class CouponShopService
{
    public function __construct(
        private readonly CouponPolicy $policy,
        private readonly CouponIssuanceService $issuance,
    ) {}

    public function authenticate(Request $request): string
    {
        abort_unless(config('demian-coupons.shop_enabled') === true, 503, 'Coupon shop integration disabled.');
        $this->policy->approved();

        if (strlen($request->getContent()) > 4096
            || ! str_contains(strtolower($request->header('Content-Type', '')), 'application/json')) {
            abort(413, 'Invalid shop request body.');
        }
        $stamp = $request->header('X-Demian-Shop-Timestamp', '');
        $event = $request->header('X-Demian-Shop-Event-Id', '');
        $signature = $request->header('X-Demian-Shop-Signature', '');
        abort_unless(is_string($stamp) && preg_match('/^[0-9]{10,12}$/D', $stamp)
            && is_string($event) && preg_match('/^[A-Za-z0-9_-]{8,80}$/D', $event)
            && is_string($signature) && preg_match('/^sha256=[a-f0-9]{64}$/D', $signature), 401);
        $skew = (int) config('demian-coupons.webhook_skew_seconds', 300);
        abort_unless(abs(now()->getTimestamp() - (int) $stamp) <= $skew, 401);

        $active = (string) config('demian-coupons.shop_signing_secret', '');
        $previous = (string) config('demian-coupons.shop_previous_signing_secret', '');
        abort_unless(strlen($active) >= 32
            && strlen((string) config('demian-coupons.order_hash_key', '')) >= 32, 503,
            'Shop signing keys are not configured.');
        $canonical = $stamp."\n".$event."\n".$request->path()."\n".$request->getContent();
        $valid = false;
        foreach ([$active, $previous] as $secret) {
            if (strlen($secret) < 32) continue;
            $expected = 'sha256='.hash_hmac('sha256', $canonical, $secret);
            $valid = hash_equals($expected, $signature) || $valid;
        }
        abort_unless($valid, 401);

        return $event;
    }

    /**
     * Signed deliveries may be retried; same event+body replays stored results.
     * A changed path/body under the same event ID is an idempotency conflict.
     */
    public function handle(string $action, string $event, Request $request, array $data): array
    {
        return DB::transaction(function () use ($action, $event, $request, $data): array {
            $digest = hash('sha256', $request->path()."\n".$request->getContent());
            $existing = DB::table('arcade_coupon_shop_requests')
                ->where('event_id', $event)->lockForUpdate()->first();
            if ($existing) {
                abort_unless($existing->action === $action && hash_equals($existing->request_digest, $digest),
                    409, 'Shop event ID conflict.');
                return ['status' => (int) $existing->response_status,
                    'body' => json_decode($existing->response_body, true, flags: JSON_THROW_ON_ERROR)];
            }

            $result = match ($action) {
                'quote' => $this->quote($data),
                'reserve' => $this->reserve($event, $data),
                'commit' => $this->commit($event, $data),
                'cancel' => $this->cancel($event, $data),
                default => throw new \InvalidArgumentException('Unsupported coupon action.'),
            };

            // No raw coupon or order reference is ever persisted in request logs.
            DB::table('arcade_coupon_shop_requests')->insert([
                'event_id' => $event, 'action' => $action, 'request_digest' => $digest,
                'response_status' => $result['status'],
                'response_body' => json_encode($result['body'], JSON_THROW_ON_ERROR),
                'created_at' => now(),
            ]);

            return $result;
        }, 3);
    }

    public function orderHash(string $reference): string
    {
        return hash_hmac('sha256', $reference, (string) config('demian-coupons.order_hash_key'));
    }

    private function findCoupon(string $code): object
    {
        $coupon = DB::table('arcade_coupons')->where('code_hash', hash('sha256', $code))
            ->lockForUpdate()->first();
        abort_unless($coupon, 404, 'Coupon not found.');

        return $coupon;
    }

    private function usable(object $coupon): void
    {
        abort_if($coupon->status === 'revoked' || $coupon->status === 'redeemed', 409, 'Coupon not available.');
        abort_if(CarbonImmutable::parse($coupon->expires_at, 'UTC')->lte(CarbonImmutable::now('UTC')),
            410, 'Coupon expired.');
    }

    private function discount(object $coupon, array $data): int
    {
        abort_unless($data['currency'] === $coupon->currency, 422, 'Coupon currency mismatch.');
        $subtotal = (int) $data['subtotal_minor'];
        abort_unless($subtotal >= (int) $coupon->min_order_minor, 422,
            'Order is below the coupon minimum.');
        // Pure integer arithmetic; never use floating point for money.
        $calculated = intdiv($subtotal, 100) * (int) $coupon->discount_percent
            + intdiv(($subtotal % 100) * (int) $coupon->discount_percent, 100);
        return min($calculated, (int) $coupon->max_discount_minor);
    }

    private function quote(array $data): array
    {
        $coupon = $this->findCoupon($data['code']);
        $this->usable($coupon);
        abort_unless($coupon->status === 'issued', 409, 'Coupon is reserved.');
        return ['status' => 200, 'body' => [
            'status' => 'eligible', 'currency' => $coupon->currency,
            'discount_minor' => $this->discount($coupon, $data),
            'discount_percent' => (int) $coupon->discount_percent,
            'expires_at' => CarbonImmutable::parse($coupon->expires_at, 'UTC')->toIso8601String(),
        ]];
    }

    private function reserve(string $event, array $data): array
    {
        $coupon = $this->findCoupon($data['code']);
        $this->usable($coupon);
        $orderHash = $this->orderHash($data['order_ref']);
        $now = CarbonImmutable::now('UTC');

        if ($coupon->status === 'reserved') {
            $held = DB::table('arcade_coupon_reservations')->where('id', $coupon->active_reservation_id)
                ->lockForUpdate()->first();
            if (! $held || $held->coupon_id !== $coupon->id || $held->status !== 'reserved') {
                throw new RuntimeException('Inconsistent coupon reservation state.');
            }
            if (CarbonImmutable::parse($held->expires_at, 'UTC')->gt($now)) {
                abort_unless(hash_equals($held->order_hash, $orderHash), 409, 'Coupon reserved by another order.');
                abort_unless($held->currency === $data['currency']
                    && (int) $held->subtotal_minor === (int) $data['subtotal_minor'], 409,
                    'Same order cannot change its signed amount.');
                return ['status' => 200, 'body' => $this->reservationResponse($held)];
            }
            // An expired reservation cannot be committed. The old order hash
            // remains permanently blocked from getting a second discount.
            DB::table('arcade_coupon_reservations')->where('id', $held->id)->update([
                'status' => 'expired', 'updated_at' => $now->toDateTimeString(),
            ]);
            DB::table('arcade_coupons')->where('id', $coupon->id)->update([
                'status' => 'issued', 'active_reservation_id' => null, 'updated_at' => $now->toDateTimeString(),
            ]);
            $this->issuance->audit((int) $coupon->id, 'reservation_expired', [], $event, $held->order_hash);
        }
        abort_if(DB::table('arcade_coupon_reservations')->where('order_hash', $orderHash)->exists(),
            409, 'Order already has a coupon reservation.');
        $discount = $this->discount($coupon, $data);
        $end = $now->addMinutes((int) config('demian-coupons.reservation_minutes', 15));
        $expires = $end->lt(CarbonImmutable::parse($coupon->expires_at, 'UTC'))
            ? $end : CarbonImmutable::parse($coupon->expires_at, 'UTC');
        $id = DB::table('arcade_coupon_reservations')->insertGetId([
            'coupon_id' => $coupon->id, 'order_hash' => $orderHash,
            'status' => 'reserved', 'currency' => $coupon->currency,
            'subtotal_minor' => (int) $data['subtotal_minor'], 'discount_minor' => $discount,
            'expires_at' => $expires->toDateTimeString(),
            'created_at' => $now->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
        ]);
        DB::table('arcade_coupons')->where('id', $coupon->id)->update([
            'status' => 'reserved', 'active_reservation_id' => $id,
            'updated_at' => $now->toDateTimeString(),
        ]);
        $this->issuance->audit((int) $coupon->id, 'reserved',
            ['discount_minor' => $discount, 'currency' => $coupon->currency], $event, $orderHash);
        $reservation = DB::table('arcade_coupon_reservations')->where('id', $id)->first();

        return ['status' => 201, 'body' => $this->reservationResponse($reservation)];
    }

    private function reservationResponse(object $reservation): array
    {
        return [
            'status' => 'reserved', 'reservation_id' => (int) $reservation->id,
            'discount_minor' => (int) $reservation->discount_minor,
            'currency' => $reservation->currency,
            'expires_at' => CarbonImmutable::parse($reservation->expires_at, 'UTC')->toIso8601String(),
        ];
    }

    private function commit(string $event, array $data): array
    {
        $coupon = $this->findCoupon($data['code']);
        $orderHash = $this->orderHash($data['order_ref']);
        if ($coupon->status === 'redeemed') {
            $receipt = DB::table('arcade_coupon_redemptions')->where('coupon_id', $coupon->id)->first();
            abort_unless($receipt && hash_equals($receipt->order_hash, $orderHash), 409,
                'Coupon has already been redeemed.');
            return ['status' => 200, 'body' => $this->receiptResponse($receipt)];
        }
        $this->usable($coupon);
        abort_unless($coupon->status === 'reserved' && $coupon->active_reservation_id,
            409, 'Reservation required before committing a coupon.');
        $reservation = DB::table('arcade_coupon_reservations')
            ->where('id', $coupon->active_reservation_id)->lockForUpdate()->first();
        abort_unless($reservation && $reservation->status === 'reserved'
            && hash_equals($reservation->order_hash, $orderHash), 409, 'Order reservation mismatch.');
        abort_unless(CarbonImmutable::parse($reservation->expires_at, 'UTC')
            ->gt(CarbonImmutable::now('UTC')), 410, 'Reservation expired.');

        DB::table('arcade_coupon_reservations')->where('id', $reservation->id)->update([
            'status' => 'committed', 'committed_at' => now(), 'updated_at' => now(),
        ]);
        $id = DB::table('arcade_coupon_redemptions')->insertGetId([
            'coupon_id' => $coupon->id, 'reservation_id' => $reservation->id,
            'order_hash' => $orderHash, 'currency' => $reservation->currency,
            'subtotal_minor' => $reservation->subtotal_minor,
            'discount_minor' => $reservation->discount_minor, 'redeemed_at' => now(),
        ]);
        DB::table('arcade_coupons')->where('id', $coupon->id)->update([
            'status' => 'redeemed', 'redeemed_at' => now(), 'updated_at' => now(),
        ]);
        $this->issuance->audit((int) $coupon->id, 'redeemed',
            ['discount_minor' => (int) $reservation->discount_minor], $event, $orderHash);
        $receipt = DB::table('arcade_coupon_redemptions')->where('id', $id)->first();

        return ['status' => 200, 'body' => $this->receiptResponse($receipt)];
    }

    private function receiptResponse(object $receipt): array
    {
        return [
            'status' => 'redeemed', 'receipt_id' => (int) $receipt->id,
            'discount_minor' => (int) $receipt->discount_minor,
            'currency' => $receipt->currency,
        ];
    }

    private function cancel(string $event, array $data): array
    {
        $coupon = $this->findCoupon($data['code']);
        abort_if($coupon->status === 'redeemed' || $coupon->status === 'revoked',
            409, 'Cannot cancel a redeemed or revoked coupon.');
        $orderHash = $this->orderHash($data['order_ref']);
        $prior = DB::table('arcade_coupon_reservations')->where('order_hash', $orderHash)->first();
        abort_unless($prior && $prior->coupon_id === $coupon->id, 409, 'Order reservation not found.');
        if ($prior->status === 'cancelled') {
            return ['status' => 200, 'body' => ['status' => 'cancelled']];
        }
        abort_unless($coupon->status === 'reserved'
            && (int) $coupon->active_reservation_id === (int) $prior->id
            && $prior->status === 'reserved', 409, 'Reservation cannot be cancelled.');
        DB::table('arcade_coupon_reservations')->where('id', $prior->id)->update([
            'status' => 'cancelled', 'cancelled_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_coupons')->where('id', $coupon->id)->update([
            'status' => 'issued', 'active_reservation_id' => null, 'updated_at' => now(),
        ]);
        $this->issuance->audit((int) $coupon->id, 'reservation_cancelled', [], $event, $orderHash);

        return ['status' => 200, 'body' => ['status' => 'cancelled']];
    }
}
