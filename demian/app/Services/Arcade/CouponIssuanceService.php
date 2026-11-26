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
        app(ArcadePrizeIdentity::class)->assertRolloutReady();
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
            $campaignService = app(RewardCampaignService::class);
            $campaign = null;
            if (config('demian-coupons.campaigns_enabled') === true) {
                $issued = DB::table('arcade_coupons')
                    ->whereIn('winner_id', $winners->pluck('id')->all())->count();
                $campaign = $campaignService->lockedForIssuance(
                    $periodKey, $winners->count(), $winners->count() - $issued);
            }
            if (! $campaign && app(CampaignEconomics::class)->required() && $winners->isNotEmpty()) {
                throw new RuntimeException('Weekly awards require an approved budgeted campaign.');
            }
            $effectiveTerms = $campaign
                ? json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR) : $terms;
            $created = 0;
            $existing = 0;
            foreach ($winners as $winner) {
                if (! $winner->player_id || ! $winner->run_id
                    || ! is_int((int) $winner->prize_rank)
                    || ! isset($effectiveTerms['ranks'][(int) $winner->prize_rank])
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
                // Verified rank is NOT proof of phone ownership or right to a
                // cash-equivalent voucher. Enforce this under the same issuer
                // transaction before reserving sponsor inventory or codes.
                app(ArcadePrizeIdentity::class)->assertVerifiedRecipient($winner->player_id);
                if ($winner->game_id === CafeDriftReplayVerifier::GAME_ID
                    && (! $campaign || ! app(RankedGameCatalog::class)->supportsPrizes($winner->game_id)
                        || ! DB::table('arcade_weekly_rule_locks')->where('period_key', $periodKey)
                            ->where('game_id', $winner->game_id)->where('rules_version', $winner->rules_version)
                            ->where('ranked_enabled', true)->where('prize_eligible', true)->exists())) {
                    throw new RuntimeException('Café Drift prizes require an eligible season and an active sponsor campaign.');
                }
                $item = $campaign ? $campaignService->claim($campaign) : null;
                $code = $item ? Crypt::decryptString($item->code_ciphertext)
                    : 'DMC-'.strtoupper(bin2hex(random_bytes(16)));
                $now = CarbonImmutable::now('UTC');
                $couponId = DB::table('arcade_coupons')->insertGetId([
                    'winner_id' => $winner->id, 'player_id' => $winner->player_id,
                    'code_hash' => $item ? $item->code_hash : hash('sha256', $code),
                    'code_ciphertext' => $item ? $item->code_ciphertext
                        : Crypt::encryptString($code),
                    'campaign_id' => $campaign?->id,
                    'policy_version' => $effectiveTerms['version'],
                    'discount_percent' => $effectiveTerms['ranks'][(int) $winner->prize_rank],
                    'currency' => $effectiveTerms['currency'],
                    'min_order_minor' => $effectiveTerms['min_order_minor'],
                    'max_discount_minor' => $effectiveTerms['max_discount_minor'],
                    'status' => 'issued', 'issued_at' => $now->toDateTimeString(),
                    'expires_at' => CarbonImmutable::parse($period->sealed_at, 'UTC')->addDays(CouponPolicy::WEEKLY_VALID_DAYS)->toDateTimeString(),
                    'created_at' => $now->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
                if ($item) {
                    $campaignService->assign((int) $item->id, $couponId, (int) $campaign->id);
                }
                $this->audit($couponId, 'issued', ['winner_id' => $winner->id,
                    'period_key' => $periodKey,
                    'policy_version' => $effectiveTerms['version'],
                    'campaign_id' => $campaign?->id]);
                $created++;
            }

            return ['period_key' => $periodKey, 'created' => $created,
                'existing' => $existing, 'winners' => $winners->count()];
        }, 3);
    }

    public function listForPlayer(string $playerId): array
    {
        $query = DB::table('arcade_coupons as c')
            ->leftJoin('arcade_weekly_winners as w', 'w.id', '=', 'c.winner_id')
            ->leftJoin('arcade_coupon_gifts as g', 'g.id', '=', 'c.gift_id')
            ->where('c.player_id', $playerId)->orderByDesc('c.id')
            ->get(['c.*', 'w.period_key', 'w.game_id', 'w.prize_rank',
                'g.reason as gift_reason']);
        $delivery = app(CouponDeliverySupportService::class)
            ->statusesForCoupons($query->pluck('id')->all());
        $enabled = config('demian-coupons.delivery_support_enabled') === true;

        return $query->map(function ($coupon) use ($delivery, $enabled): array {
                $expired = CarbonImmutable::parse($coupon->expires_at, 'UTC')->lte(CarbonImmutable::now('UTC'));
                $status = $expired && $coupon->status !== 'redeemed' && $coupon->status !== 'revoked'
                    ? 'expired' : $coupon->status;
                $showCode = in_array($status, ['issued', 'reserved'], true);
                return [
                    'coupon_id' => $coupon->id,
                    'source' => $coupon->source,
                    'gift_reason' => $coupon->source === 'gift' ? $coupon->gift_reason : null,
                    'period_key' => $coupon->period_key, 'game_id' => $coupon->game_id,
                    'prize_rank' => $coupon->prize_rank === null
                        ? null : (int) $coupon->prize_rank,
                    'discount_percent' => (int) $coupon->discount_percent,
                    'currency' => $coupon->currency, 'min_order_minor' => (int) $coupon->min_order_minor,
                    'max_discount_minor' => (int) $coupon->max_discount_minor,
                    'expires_at' => CarbonImmutable::parse($coupon->expires_at, 'UTC')->toIso8601String(),
                    'status' => $status,
                    'support_enabled' => $enabled,
                    'acknowledged_at' => isset($delivery['receipts'][$coupon->id])
                        ? CarbonImmutable::parse(
                            $delivery['receipts'][$coupon->id]->acknowledged_at, 'UTC'
                        )->toIso8601String() : null,
                    'case_id' => $delivery['cases'][$coupon->id]->id ?? null,
                    'case_status' => $delivery['cases'][$coupon->id]->status ?? null,
                    'code' => $showCode ? Crypt::decryptString($coupon->code_ciphertext) : null,
                ];
            })->all();
    }

    /** The deletion caller holds a player row lock and a DB transaction. */
    public function revokeForDeletedPlayer(string $playerId): void
    {
        // Strip free-text support history within the same erasure transaction.
        app(CouponDeliverySupportService::class)->erasePrivateNotes($playerId);
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
