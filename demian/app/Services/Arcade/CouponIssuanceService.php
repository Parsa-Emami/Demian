<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Internal-only issuance from sealed, server-verified award snapshots.
 * This service is NOT the legacy Domain\Economy coupon placeholder.
 */
final class CouponIssuanceService
{
    public function __construct(private readonly CouponPolicy $policy) {}

    public function issueWeek(string $periodKey): array
    {
        if (config('demian-coupons.issue_enabled') !== true) {
            throw new RuntimeException('Coupon issuance is disabled.');
        }
        $terms = $this->policy->approved();
        if (! preg_match('/^weekly:tehran:\d{4}-\d{2}-\d{2}$/D', $periodKey)) {
            throw new \InvalidArgumentException('Invalid weekly period key.');
        }

        return DB::transaction(function () use ($periodKey, $terms): array {
            $period = DB::table('arcade_weekly_periods')->where('period_key', $periodKey)
                ->lockForUpdate()->first();
            if (! $period || $period->status !== 'sealed' || ! $period->sealed_at
                || ! preg_match('/^[a-f0-9]{64}$/D', $period->snapshot_hash ?? '')) {
                throw new RuntimeException('Only verified sealed weekly results can issue coupons.');
            }

            // Reconstruct Phase 7b's canonical sealed snapshot. A forged
            // winner, deleted run or altered score must not mint real value.
            $snapshot = [];
            $entries = DB::table('arcade_weekly_results')->where('period_key', $periodKey)
                ->orderBy('game_id')->orderBy('technical_rank')->get();
            foreach ($entries as $row) {
                $snapshot[] = [
                    'period_key' => $row->period_key, 'game_id' => $row->game_id,
                    'rules_version' => $row->rules_version, 'player_id' => $row->player_id,
                    'run_id' => $row->run_id, 'score' => (int) $row->score,
                    'achieved_at' => $row->achieved_at, 'technical_rank' => (int) $row->technical_rank,
                    'created_at' => $row->created_at,
                ];
            }
            $digest = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
            if (count($snapshot) !== (int) $period->participants
                || ! hash_equals($period->snapshot_hash, $digest)) {
                throw new RuntimeException('Sealed technical ranking checksum mismatch.');
            }

            $winners = DB::table('arcade_weekly_winners')->where('period_key', $periodKey)
                ->orderBy('id')->lockForUpdate()->get();
            if ($winners->count() !== (int) $period->winner_count) {
                throw new RuntimeException('Seal winner count mismatch; issuance aborted.');
            }
            $created = 0;
            $existing = 0;
            foreach ($winners as $winner) {
                if (! $winner->player_id || ! $winner->run_id
                    || ! is_int((int) $winner->prize_rank)
                    || ! isset($terms['ranks'][(int) $winner->prize_rank])
                    || ! DB::table('arcade_players')->where('id', $winner->player_id)->exists()) {
                    throw new RuntimeException('Award is incomplete or its player was erased.');
                }
                // Prove the prize refers to this sealed technical placement.
                if (! (new RankedGameCatalog())->supportsRanked($winner->game_id)
                    || ! DB::table('arcade_weekly_results')
                        ->where('period_key', $periodKey)->where('game_id', $winner->game_id)
                        ->where('technical_rank', $winner->technical_rank)
                        ->where('rules_version', $winner->rules_version)
                        ->where('player_id', $winner->player_id)
                        ->where('run_id', $winner->run_id)
                        ->where('score', $winner->score)->exists()) {
                    throw new RuntimeException('Weekly award has no matching verified snapshot proof.');
                }
                if (DB::table('arcade_coupons')->where('winner_id', $winner->id)->exists()) {
                    $existing++;
                    continue;
                }
                $code = 'DMC-'.strtoupper(bin2hex(random_bytes(16))); // 128-bit CSPRNG.
                $now = CarbonImmutable::now('UTC');
                $couponId = DB::table('arcade_coupons')->insertGetId([
                    'winner_id' => $winner->id, 'player_id' => $winner->player_id,
                    'code_hash' => hash('sha256', $code),
                    'code_ciphertext' => Crypt::encryptString($code),
                    'policy_version' => $terms['version'],
                    'discount_percent' => $terms['ranks'][(int) $winner->prize_rank],
                    'currency' => $terms['currency'], 'min_order_minor' => $terms['min_order_minor'],
                    'max_discount_minor' => $terms['max_discount_minor'], 'status' => 'issued',
                    'issued_at' => $now->toDateTimeString(),
                    'expires_at' => $now->addDays($terms['valid_days'])->toDateTimeString(),
                    'created_at' => $now->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
                $this->audit($couponId, 'issued', ['winner_id' => $winner->id,
                    'period_key' => $periodKey, 'policy_version' => $terms['version']]);
                $created++;
            }

            return ['period_key' => $periodKey, 'created' => $created,
                'existing' => $existing, 'winners' => $winners->count()];
        }, 3);
    }

    public function listForPlayer(string $playerId): array
    {
        return DB::table('arcade_coupons as c')
            ->join('arcade_weekly_winners as w', 'w.id', '=', 'c.winner_id')
            ->where('c.player_id', $playerId)->orderByDesc('c.id')
            ->get(['c.*', 'w.period_key', 'w.game_id', 'w.prize_rank'])
            ->map(function ($coupon): array {
                $expired = CarbonImmutable::parse($coupon->expires_at, 'UTC')->lte(CarbonImmutable::now('UTC'));
                $status = $expired && $coupon->status !== 'redeemed' && $coupon->status !== 'revoked'
                    ? 'expired' : $coupon->status;
                $showCode = in_array($status, ['issued', 'reserved'], true);
                return [
                    'coupon_id' => $coupon->id,
                    'period_key' => $coupon->period_key, 'game_id' => $coupon->game_id,
                    'prize_rank' => (int) $coupon->prize_rank, 'discount_percent' => (int) $coupon->discount_percent,
                    'currency' => $coupon->currency, 'min_order_minor' => (int) $coupon->min_order_minor,
                    'max_discount_minor' => (int) $coupon->max_discount_minor,
                    'expires_at' => CarbonImmutable::parse($coupon->expires_at, 'UTC')->toIso8601String(),
                    'status' => $status,
                    'code' => $showCode ? Crypt::decryptString($coupon->code_ciphertext) : null,
                ];
            })->all();
    }

    /** The deletion caller holds a player row lock and a DB transaction. */
    public function revokeForDeletedPlayer(string $playerId): void
    {
        $coupons = DB::table('arcade_coupons')->where('player_id', $playerId)
            ->orderBy('id')->lockForUpdate()->get();
        foreach ($coupons as $coupon) {
            // Always purge redeemable material on erasure, even if already
            // captured. Preserve only the hash and nonsecret order ledger.
            if (! in_array($coupon->status, ['issued', 'reserved'], true)) {
                DB::table('arcade_coupons')->where('id', $coupon->id)
                    ->update(['code_ciphertext' => null, 'updated_at' => now()]);
                continue;
            }
            if ($coupon->status === 'reserved' && $coupon->active_reservation_id) {
                DB::table('arcade_coupon_reservations')->where('id', $coupon->active_reservation_id)
                    ->where('status', 'reserved')->update([
                        'status' => 'cancelled', 'cancelled_at' => now(), 'updated_at' => now(),
                    ]);
            }
            DB::table('arcade_coupons')->where('id', $coupon->id)->update([
                'status' => 'revoked', 'code_ciphertext' => null,
                'active_reservation_id' => null, 'revoked_at' => now(),
                'updated_at' => now(),
            ]);
            $this->audit((int) $coupon->id, 'revoked', ['reason' => 'account_erasure']);
        }
    }

    public function revoke(int $couponId, string $reason): array
    {
        if (! in_array($reason, ['fraud', 'policy', 'incident'], true)) {
            throw new \InvalidArgumentException('Invalid revocation reason.');
        }
        return DB::transaction(function () use ($couponId, $reason): array {
            $coupon = DB::table('arcade_coupons')->where('id', $couponId)->lockForUpdate()->first();
            if (! $coupon) throw new RuntimeException('Coupon not found.');
            if ($coupon->status === 'redeemed') throw new RuntimeException('Redeemed coupons cannot be revoked.');
            if ($coupon->status === 'revoked') return ['status' => 'already_revoked', 'coupon_id' => $couponId];
            if ($coupon->status === 'reserved' && $coupon->active_reservation_id) {
                DB::table('arcade_coupon_reservations')->where('id', $coupon->active_reservation_id)
                    ->where('status', 'reserved')->update([
                        'status' => 'cancelled', 'cancelled_at' => now(), 'updated_at' => now(),
                    ]);
            }
            DB::table('arcade_coupons')->where('id', $couponId)->update([
                'status' => 'revoked', 'active_reservation_id' => null, 'revoked_at' => now(),
                'code_ciphertext' => null, 'updated_at' => now(),
            ]);
            $this->audit($couponId, 'revoked', ['reason' => $reason]);
            return ['status' => 'revoked', 'coupon_id' => $couponId];
        }, 3);
    }

    public function audit(int $couponId, string $type, array $details, ?string $shopEventId = null,
        ?string $orderHash = null): void
    {
        DB::table('arcade_coupon_events')->insert([
            'coupon_id' => $couponId, 'event_type' => $type,
            'shop_event_id' => $shopEventId, 'order_hash' => $orderHash,
            'details' => json_encode($details, JSON_THROW_ON_ERROR),
            'created_at' => now(),
        ]);
    }
}
