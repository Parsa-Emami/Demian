<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

final class CouponDeliverySupportService
{
    public const CATEGORIES = [
        'not_received', 'invalid_code', 'redemption', 'terms', 'other',
    ];
    public const DECISIONS = ['explained', 'rejected', 'revoked', 'replaced'];

    private function enabled(): void
    {
        abort_unless(config('demian-coupons.delivery_support_enabled') === true,
            503, 'Coupon delivery support is not enabled.');
    }

    /** The ordering shared with player erasure and gift issuance: player, coupon. */
    private function owner(string $playerId, int $couponId): object
    {
        $player = DB::table('arcade_players')->where('id', $playerId)
            ->lockForUpdate()->first();
        abort_unless($player, 401, 'Player account is unavailable.');
        $coupon = DB::table('arcade_coupons')->where('id', $couponId)
            ->lockForUpdate()->first();
        abort_unless($coupon && $coupon->player_id === $playerId, 404,
            'Coupon not found for this player.');

        return $coupon;
    }

    public function acknowledge(string $playerId, int $couponId): array
    {
        $this->enabled();

        return DB::transaction(function () use ($playerId, $couponId): array {
            $this->owner($playerId, $couponId);
            $current = DB::table('arcade_coupon_delivery_receipts')
                ->where('coupon_id', $couponId)->first();
            if ($current) {
                return [
                    'coupon_id' => $couponId,
                    'acknowledged_at' => CarbonImmutable::parse(
                        $current->acknowledged_at, 'UTC')->toIso8601String(),
                    'already_acknowledged' => true,
                ];
            }
            $at = CarbonImmutable::now('UTC');
            DB::table('arcade_coupon_delivery_receipts')->insert([
                'coupon_id' => $couponId, 'player_id' => $playerId,
                'acknowledged_at' => $at->toDateTimeString(),
            ]);
            app(CouponIssuanceService::class)->audit(
                $couponId, 'delivery_acknowledged', ['channel' => 'private_wallet']);
            return [
                'coupon_id' => $couponId,
                'acknowledged_at' => $at->toIso8601String(),
                'already_acknowledged' => false,
            ];
        }, 3);
    }

    public function submit(string $playerId, int $couponId, array $data): array
    {
        $this->enabled();
        $category = (string) ($data['category'] ?? '');
        $description = trim((string) ($data['description'] ?? ''));
        $key = (string) ($data['request_key'] ?? '');
        abort_unless(Str::isUuid($key)
            && in_array($category, self::CATEGORIES, true)
            && mb_strlen($description) <= 300
            && ! self::containsSecretOrContact($description), 422,
            'Invalid support ticket or sensitive information in description.');
        // No raw customer code, phone number or email should be required.
        $digest = hash('sha256', json_encode([
            'coupon_id' => $couponId, 'category' => $category,
            'description' => $description,
        ], JSON_THROW_ON_ERROR));

        try {
            return DB::transaction(function () use ($playerId, $couponId,
                $key, $category, $description, $digest): array {
                $this->owner($playerId, $couponId);

                $prior = DB::table('arcade_coupon_disputes')
                    ->where('request_key', $key)->first();
                if ($prior) {
                    abort_unless($prior->player_id === $playerId
                        && (int) $prior->coupon_id === $couponId
                        && hash_equals($prior->request_digest, $digest),
                        409, 'Request key is already used for a different dispute.');

                    return [
                        'case_id' => (int) $prior->id,
                        'status' => $prior->status, 'idempotent_replay' => true,
                    ];
                }

                abort_if(DB::table('arcade_coupon_disputes')
                    ->where('open_coupon_id', $couponId)->exists(),
                    409, 'This coupon already has an open support ticket.');
                abort_if(DB::table('arcade_coupon_disputes')
                    ->where('player_id', $playerId)
                    ->where('created_at', '>=', now()->subDay())->count() >= 3,
                    429, 'Daily support request limit reached.');

                $id = DB::table('arcade_coupon_disputes')->insertGetId([
                    'request_key' => $key, 'request_digest' => $digest,
                    'coupon_id' => $couponId, 'player_id' => $playerId,
                    'open_coupon_id' => $couponId, 'category' => $category,
                    'description' => $description ?: null,
                    'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
                ]);
                $this->event($id, null, 'opened', ['category' => $category]);

                return ['case_id' => $id, 'status' => 'open',
                    'idempotent_replay' => false];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            abort(409, 'Concurrent duplicate support ticket; refresh your wallet.');
        }
    }

    /** Safe, bounded, code-free owner status summaries for the wallet. */
    public function statusesForCoupons(array $ids): array
    {
        if (! $ids || config('demian-coupons.delivery_support_enabled') !== true) {
            return ['receipts' => [], 'cases' => []];
        }
        $receipts = DB::table('arcade_coupon_delivery_receipts')
            ->whereIn('coupon_id', $ids)->get()->keyBy('coupon_id')->all();
        $cases = DB::table('arcade_coupon_disputes')->whereIn('coupon_id', $ids)
            ->orderByDesc('id')->get()->unique('coupon_id')->keyBy('coupon_id')->all();

        return ['receipts' => $receipts, 'cases' => $cases];
    }

    public function queue(): array
    {
        $this->enabled();
        return DB::table('arcade_coupon_disputes as d')
            ->join('arcade_coupons as c', 'c.id', '=', 'd.coupon_id')
            ->orderByRaw("CASE WHEN d.status = 'open' THEN 0 ELSE 1 END")
            ->orderByDesc('d.id')->limit(100)
            ->get(['d.id', 'd.coupon_id', 'd.category', 'd.description',
                'd.status', 'd.resolution', 'd.resolution_note', 'd.closed_at',
                'd.replacement_coupon_id', 'd.created_at',
                'c.source', 'c.status as coupon_status', 'c.expires_at',
                'c.discount_percent', 'c.currency'])
            ->all();
    }

    /**
     * Superadmin decision uses existing irreversible revoke and tightly gated
     * compensation gift. Never un-redeem, reuse a campaign code or mint a
     * second valid voucher while the old one is still usable.
     */
    public function decide(int $actorId, int $version, int $caseId,
        string $decision, string $note): array
    {
        $this->enabled();
        abort_unless(in_array($decision, self::DECISIONS, true)
            && mb_strlen(trim($note)) >= 10
            && mb_strlen(trim($note)) <= 300
            && ! self::containsSecretOrContact($note), 422,
            'A valid decision and written review reason are required.');

        return DB::transaction(function () use ($actorId, $version,
            $caseId, $decision, $note): array {
            $staff = DB::table('arcade_cashier_staff')->where('id', $actorId)
                ->lockForUpdate()->first();
            CafeAccess::authorizeGift($staff);
            abort_unless((int) $staff->session_version === $version, 403,
                'Administrative session changed.');

            $initial = DB::table('arcade_coupon_disputes')
                ->where('id', $caseId)->first();
            abort_unless($initial, 404, 'Unknown support case.');
            $player = $initial->player_id
                ? DB::table('arcade_players')->where('id', $initial->player_id)
                    ->lockForUpdate()->first() : null;
            $coupon = DB::table('arcade_coupons')->where('id', $initial->coupon_id)
                ->lockForUpdate()->first();
            $case = DB::table('arcade_coupon_disputes')->where('id', $caseId)
                ->lockForUpdate()->first();
            abort_unless($case && $coupon
                && ($case->player_id === null
                    || ($player && $coupon->player_id === $case->player_id)),
                409, 'Case ownership or coupon ledger has changed.');

            if ($case->status !== 'open') {
                abort_unless($case->resolution === $decision, 409,
                    'The case has already been closed with a different decision.');
                return [
                    'case_id' => $caseId, 'status' => $case->status,
                    'replacement_coupon_id' => $case->replacement_coupon_id,
                    'idempotent_replay' => true,
                ];
            }

            $replacementId = null;
            if (in_array($decision, ['revoked', 'replaced'], true)) {
                abort_unless($player && $coupon->status === 'issued'
                    && ! DB::table('arcade_coupon_redemptions')
                        ->where('coupon_id', $coupon->id)->exists(),
                    409, 'Cannot reverse a consumed, reserved or erased coupon.');
                if ($decision === 'replaced') {
                    // Independent financial policy must authorize *equivalent*
                    // compensation, never a silent downgrade of the prize.
                    $terms = app(ManualCouponGiftService::class)->terms();
                    $remainingSeconds = CarbonImmutable::parse($coupon->expires_at, 'UTC')
                        ->getTimestamp() - CarbonImmutable::now('UTC')->getTimestamp();
                    $days = intdiv(max(0, $remainingSeconds), 86400);
                    abort_unless($coupon->currency === $terms['currency']
                        && (int) $coupon->discount_percent <= $terms['gift_max_percent']
                        && (int) $coupon->min_order_minor >= $terms['min_order_minor']
                        && (int) $coupon->max_discount_minor <= $terms['max_discount_minor']
                        && $days >= 1 && $days <= $terms['gift_max_valid_days'],
                        409, 'Equivalent replacement exceeds current approved gift terms.');
                }
                app(CouponIssuanceService::class)->revoke(
                    (int) $coupon->id, 'incident');
                if ($decision === 'replaced') {
                    $gift = app(ManualCouponGiftService::class)->issue(
                        $actorId, $version, [
                            'request_key' => (string) Str::uuid(),
                            'player_id' => $coupon->player_id,
                            'percent' => (int) $coupon->discount_percent,
                            'min_order_minor' => (int) $coupon->min_order_minor,
                            'max_discount_minor' => (int) $coupon->max_discount_minor,
                            'valid_days' => $days,
                            'reason' => 'compensation',
                            'reason_note' => 'Replacement for support case '.$caseId,
                        ]);
                    $replacementId = $gift['coupon_id'];
                }
            }

            $status = $decision === 'rejected' ? 'rejected' : 'resolved';
            DB::table('arcade_coupon_disputes')->where('id', $caseId)->update([
                'status' => $status, 'resolution' => $decision,
                'resolution_note' => trim($note), 'resolved_by' => $actorId,
                'replacement_coupon_id' => $replacementId,
                'open_coupon_id' => null, 'closed_at' => now(), 'updated_at' => now(),
            ]);
            $this->event($caseId, $actorId, 'closed', [
                'resolution' => $decision, 'replacement_coupon_id' => $replacementId,
            ]);
            DB::table('arcade_cashier_admin_events')->insert([
                'actor_id' => $actorId, 'subject_id' => null,
                'event_type' => 'coupon_dispute_resolved',
                'details' => json_encode([
                    'case_id' => $caseId, 'coupon_id' => $coupon->id,
                    'decision' => $decision,
                    'replacement_coupon_id' => $replacementId,
                ], JSON_THROW_ON_ERROR),
                'created_at' => now(),
            ]);

            return ['case_id' => $caseId, 'status' => $status,
                'replacement_coupon_id' => $replacementId, 'idempotent_replay' => false];
        }, 3);
    }

    private static function containsSecretOrContact(string $text): bool
    {
        return (bool) preg_match(
            '/DMC-[A-Fa-f0-9]{32}|[A-Fa-f0-9]{64}|https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[ -]?){10,}/i',
            $text
        );
    }

    private function event(int $id, ?int $actor, string $type, array $details): void
    {
        DB::table('arcade_coupon_dispute_events')->insert([
            'dispute_id' => $id, 'actor_id' => $actor,
            'event_type' => $type,
            'details' => json_encode($details, JSON_THROW_ON_ERROR),
            'created_at' => now(),
        ]);
    }

    /** Called inside the account-erasure transaction; preserve accounting only. */
    public function erasePrivateNotes(string $playerId): void
    {
        DB::table('arcade_coupon_disputes')->where('player_id', $playerId)
            ->update(['description' => null, 'resolution_note' => null,
                'open_coupon_id' => null, 'updated_at' => now()]);
    }
}
