<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Superadmin-initiated physical cafe gifts, separate from sealed weekly awards.
 *
 * Staff -> player -> gift/coupon is the lock order; the database is the final
 * authority for one request key and one coupon per gift. No plaintext coupon
 * is returned to the issuer: only its authenticated player can read it.
 */
final class ManualCouponGiftService
{
    public const REASONS = ['birthday', 'compensation', 'vip', 'campaign', 'other'];

    public function __construct(private readonly CouponPolicy $policy) {}

    public function terms(): array
    {
        abort_unless(config('demian-coupons.manual_gifts_enabled') === true
            && config('demian-coupons.cafe_enabled') === true, 503,
            'Physical cafe gift issuance is disabled.');

        $base = $this->policy->approved();
        $maxPercent = (int) config('demian-coupons.gift_max_percent', 0);
        $maxDays = (int) config('demian-coupons.gift_max_valid_days', 0);
        $issuerLimit = (int) config('demian-coupons.gift_issuer_daily_limit', 0);
        $recipientLimit = (int) config('demian-coupons.gift_recipient_daily_limit', 0);
        if ($maxPercent < 1 || $maxPercent > max($base['ranks'])
            || $maxDays < 1 || $maxDays > $base['valid_days']
            || $issuerLimit < 1 || $issuerLimit > 100
            || $recipientLimit < 1 || $recipientLimit > 10) {
            throw new RuntimeException('Gift issue limits need independent approval.');
        }

        return [
            ...$base, 'gift_max_percent' => $maxPercent,
            'gift_max_valid_days' => $maxDays,
            'gift_issuer_daily_limit' => $issuerLimit,
            'gift_recipient_daily_limit' => $recipientLimit,
        ];
    }

    private function canonical(array $input): array
    {
        return [
            'player_id' => strtolower((string) $input['player_id']),
            'percent' => (int) $input['percent'],
            'min_order_minor' => (int) $input['min_order_minor'],
            'max_discount_minor' => (int) $input['max_discount_minor'],
            'valid_days' => (int) $input['valid_days'],
            'reason' => (string) $input['reason'],
            'reason_note' => trim((string) ($input['reason_note'] ?? '')),
        ];
    }

    public function issue(int $staffId, int $sessionVersion, array $input): array
    {
        $terms = $this->terms();
        $fields = $this->canonical($input);
        $requestKey = (string) $input['request_key'];
        if (! preg_match('/^[a-f0-9-]{36}$/D', $requestKey)) {
            throw ValidationException::withMessages(['request_key' => 'Invalid request identifier.']);
        }
        if ($fields['percent'] < 1 || $fields['percent'] > $terms['gift_max_percent']
            || $fields['min_order_minor'] < $terms['min_order_minor']
            || $fields['min_order_minor'] > 1000000000000
            || $fields['max_discount_minor'] < 1
            || $fields['max_discount_minor'] > $terms['max_discount_minor']
            || $fields['valid_days'] < 1
            || $fields['valid_days'] > $terms['gift_max_valid_days']
            || ! in_array($fields['reason'], self::REASONS, true)
            || mb_strlen($fields['reason_note']) > 200) {
            throw ValidationException::withMessages([
                'percent' => 'Gift terms exceed the approved financial policy.',
            ]);
        }
        $digest = hash('sha256', json_encode($fields, JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($staffId, $sessionVersion,
            $requestKey, $digest, $fields, $terms): array {
            $actor = DB::table('arcade_cashier_staff')->where('id', $staffId)
                ->lockForUpdate()->first();
            CafeAccess::authorizeGift($actor);
            abort_unless((int) $actor->session_version === $sessionVersion, 403,
                'Staff session changed; reauthenticate.');

            $previous = DB::table('arcade_coupon_gifts')
                ->where('request_key', $requestKey)->first();
            if ($previous) {
                abort_unless((int) $previous->issuer_id === $staffId
                    && hash_equals($previous->request_digest, $digest), 409,
                    'Request identifier already belongs to another gift.');
                $coupon = DB::table('arcade_coupons')->where('gift_id', $previous->id)->first();
                if (! $coupon) {
                    throw new RuntimeException('Gift ledger is incomplete.');
                }

                return $this->receipt($previous, $coupon, true);
            }

            $recipient = DB::table('arcade_players')
                ->where('id', $fields['player_id'])->lockForUpdate()->first();
            abort_unless($recipient, 422, 'Selected player account no longer exists.');

            $start = CarbonImmutable::now('Asia/Tehran')->startOfDay()
                ->utc()->toDateTimeString();
            abort_if(DB::table('arcade_coupon_gifts')
                ->where('issuer_id', $staffId)->where('created_at', '>=', $start)->count()
                    >= $terms['gift_issuer_daily_limit'], 429,
                'Daily gift issuance limit reached.');
            abort_if(DB::table('arcade_coupon_gifts')
                ->where('player_id', $fields['player_id'])
                ->where('created_at', '>=', $start)->count()
                    >= $terms['gift_recipient_daily_limit'], 409,
                'This player has already received the daily gift limit.');

            $now = CarbonImmutable::now('UTC');
            $issuedAt = $now->toDateTimeString();
            $giftId = DB::table('arcade_coupon_gifts')->insertGetId([
                'request_key' => $requestKey, 'request_digest' => $digest,
                'issuer_id' => $staffId, 'player_id' => $fields['player_id'],
                'reason' => $fields['reason'],
                'reason_note' => $fields['reason_note'] ?: null,
                'created_at' => $issuedAt,
            ]);
            $code = 'DMC-'.strtoupper(bin2hex(random_bytes(16)));
            $couponId = DB::table('arcade_coupons')->insertGetId([
                'winner_id' => null, 'gift_id' => $giftId, 'source' => 'gift',
                'player_id' => $fields['player_id'],
                'code_hash' => hash('sha256', $code),
                'code_ciphertext' => Crypt::encryptString($code),
                'policy_version' => $terms['version'],
                'discount_percent' => $fields['percent'],
                'currency' => $terms['currency'],
                'min_order_minor' => $fields['min_order_minor'],
                'max_discount_minor' => $fields['max_discount_minor'],
                'status' => 'issued',
                'issued_at' => $issuedAt,
                'expires_at' => $now->addDays($fields['valid_days'])->toDateTimeString(),
                'created_at' => $issuedAt, 'updated_at' => $issuedAt,
            ]);

            app(CouponIssuanceService::class)->audit($couponId, 'issued', [
                'source' => 'gift', 'gift_id' => $giftId,
                'policy_version' => $terms['version'],
            ]);
            DB::table('arcade_cashier_admin_events')->insert([
                'actor_id' => $staffId, 'subject_id' => null,
                'event_type' => 'coupon_gift_issued',
                'details' => json_encode(['coupon_id' => $couponId,
                    'gift_id' => $giftId, 'reason' => $fields['reason'],
                    'percent' => $fields['percent']], JSON_THROW_ON_ERROR),
                'created_at' => $issuedAt,
            ]);

            return [
                'gift_id' => $giftId, 'coupon_id' => $couponId,
                'status' => 'issued', 'idempotent_replay' => false,
                'recipient_id' => $fields['player_id'],
            ];
        }, 3);
    }

    private function receipt(object $gift, object $coupon, bool $replayed): array
    {
        return [
            'gift_id' => (int) $gift->id, 'coupon_id' => (int) $coupon->id,
            'status' => $coupon->status,
            'idempotent_replay' => $replayed,
            'recipient_id' => $gift->player_id,
        ];
    }

    /** Does not expose player tokens, recovery links or discount code material. */
    public function searchPlayers(string $query): array
    {
        if (mb_strlen($query) < 2 || mb_strlen($query) > 60) return [];
        // Escape wildcard characters to avoid accidental full-table scans.
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $query);

        return DB::table('arcade_players')
            ->where(function ($builder) use ($query, $escaped): void {
                $builder->where('id', $query)
                    ->orWhere('display_name', 'like', $escaped.'%');
            })
            ->orderBy('display_name')->limit(20)
            ->get(['id', 'display_name'])
            ->map(static fn (object $player): array => [
                'id' => $player->id, 'name' => $player->display_name,
            ])->all();
    }

    /** Read-only ledger for authorized superadmins, no bearer secrets. */
    public function recent(int $limit = 50): array
    {
        return DB::table('arcade_coupon_gifts as g')
            ->join('arcade_coupons as c', 'c.gift_id', '=', 'g.id')
            ->join('arcade_cashier_staff as s', 's.id', '=', 'g.issuer_id')
            ->leftJoin('arcade_players as p', 'p.id', '=', 'g.player_id')
            ->orderByDesc('g.id')->limit(max(1, min($limit, 100)))
            ->get(['g.id', 'c.id as coupon_id', 'p.display_name as recipient',
                'g.reason', 'g.created_at', 's.display_name as issuer',
                'c.discount_percent', 'c.expires_at', 'c.status'])
            ->map(static fn (object $row): array => [
                'gift_id' => $row->id, 'coupon_id' => $row->coupon_id,
                'recipient' => $row->recipient ?? '[erased]',
                'reason' => $row->reason, 'created_at' => $row->created_at,
                'issuer' => $row->issuer, 'percent' => $row->discount_percent,
                'expires_at' => $row->expires_at, 'status' => $row->status,
            ])->all();
    }
}
