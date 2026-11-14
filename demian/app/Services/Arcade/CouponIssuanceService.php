<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * Issues encrypted, bearer-style voucher codes solely from sealed winners.
 * Requires separately approved pricing policy and an explicit operator action.
 */
final class CouponIssuanceService
{
    public function policy(): array
    {
        abort_unless(config('demian-coupons.issuance_enabled')
            && config('demian-coupons.policy_approved'), 503, 'Coupon issuance is disabled.');

        $currency = config('demian-coupons.currency');
        $days = config('demian-coupons.valid_days');
        $minimum = config('demian-coupons.minimum_minor');
        $cap = config('demian-coupons.cap_minor');
        $tiers = config('demian-coupons.tiers');

        if (! is_string($currency) || ! preg_match('/^[A-Z]{3}$/D', $currency)
            || ! is_int($days) || $days < 1 || $days > 365
            || ! is_int($minimum) || $minimum < 0 || $minimum > 1000000000
            || ! is_int($cap) || $cap < 1 || $cap > 1000000000
            || ! is_array($tiers) || count($tiers) !== 10
            || array_keys($tiers) !== range(1, 10)
            || $tiers !== [1 => 30, 2 => 20, 3 => 20, 4 => 10, 5 => 10,
                6 => 10, 7 => 10, 8 => 10, 9 => 10, 10 => 10]) {
            throw new RuntimeException('Coupon policy is incomplete or invalid.');
        }

        return [
            'version' => 'weekly-coupon-v1',
            'currency' => $currency,
            'valid_days' => $days,
            'minimum_minor' => $minimum,
            'cap_minor' => $cap,
            'tiers' => $tiers,
        ];
    }

    /**
     * @return array{period_key:string,status:string,coupons:int}
     */
    public function issue(string $periodKey): array
    {
        if (! preg_match('/^weekly:tehran:\d{4}-\d{2}-\d{2}$/D', $periodKey)) {
            throw new \InvalidArgumentException('Expected weekly:tehran:YYYY-MM-DD.');
        }
        $policy = $this->policy();
        $policyJson = json_encode($policy, JSON_THROW_ON_ERROR);
        $policyHash = hash('sha256', $policyJson);

        return DB::transaction(function () use ($periodKey, $policy, $policyJson, $policyHash): array {
            $period = DB::table('arcade_weekly_periods')
                ->where('period_key', $periodKey)->lockForUpdate()->first();
            if (! $period || $period->status !== 'sealed' || ! $period->sealed_at
                || ! $period->snapshot_hash) {
                throw new RuntimeException('Weekly rankings are not sealed.');
            }
            // Recompute the exact canonical Phase 7b technical ranking digest.
            // The seal is not merely a status flag: altered ranks, missing
            // entrants or fabricated winners must never mint monetary value.
            $snapshotRows = DB::table('arcade_weekly_results')
                ->where('period_key', $periodKey)
                ->orderBy('game_id')->orderBy('technical_rank')->get();
            $canonical = [];
            foreach ($snapshotRows as $row) {
                $canonical[] = [
                    'period_key' => $row->period_key, 'game_id' => $row->game_id,
                    'rules_version' => $row->rules_version, 'player_id' => $row->player_id,
                    'run_id' => $row->run_id, 'score' => (int) $row->score,
                    'achieved_at' => $row->achieved_at,
                    'technical_rank' => (int) $row->technical_rank,
                    'created_at' => $row->created_at,
                ];
            }
            if (count($canonical) !== (int) $period->participants
                || ! hash_equals($period->snapshot_hash,
                    hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR)))) {
                throw new RuntimeException('Sealed technical ranking checksum mismatch.');
            }

            $existing = DB::table('arcade_reward_batches')->where('period_key', $periodKey)->first();
            if ($existing) {
                if ($existing->settlement_hash !== $period->snapshot_hash
                    || $existing->policy_hash !== $policyHash
                    || (int) $existing->coupon_count !== (int) $period->winner_count) {
                    throw new RuntimeException('Previously issued batch has a different immutable policy.');
                }
                return ['period_key' => $periodKey, 'status' => 'already_issued',
                    'coupons' => (int) $existing->coupon_count];
            }

            $winners = DB::table('arcade_weekly_winners')
                ->where('period_key', $periodKey)->orderBy('id')->get();
            if ($winners->count() !== (int) $period->winner_count) {
                throw new RuntimeException('Sealed winner count does not match archive.');
            }

            $expires = now()->utc()->addDays($policy['valid_days']);
            $issuedAt = now()->utc()->toDateTimeString();
            $seen = [];
            foreach ($winners as $winner) {
                if (! $winner->player_id || ! $winner->run_id
                    || $winner->prize_rank < 1 || $winner->prize_rank > 10
                    || isset($seen[$winner->player_id])) {
                    throw new RuntimeException('Incomplete or duplicated sealed winner.');
                }
                $rankingProof = DB::table('arcade_weekly_results')
                    ->where('period_key', $periodKey)
                    ->where('game_id', $winner->game_id)
                    ->where('rules_version', $winner->rules_version)
                    ->where('technical_rank', $winner->technical_rank)
                    ->where('player_id', $winner->player_id)
                    ->where('run_id', $winner->run_id)
                    ->where('score', $winner->score)
                    ->where('achieved_at', $winner->achieved_at)->exists();
                if (! $rankingProof) {
                    throw new RuntimeException('Prize winner has no exact sealed technical rank.');
                }
                $verified = DB::table('arcade_runs')->where('id', $winner->run_id)->first();
                if (! (new RankedGameCatalog())->supportsRanked($winner->game_id)
                    || ! $verified || $verified->status !== 'verified'
                    || ! $verified->replay_hash || ! $verified->completed_at
                    || $verified->player_id !== $winner->player_id
                    || $verified->game_id !== $winner->game_id
                    || $verified->rules_version !== $winner->rules_version
                    || (int) $verified->score !== (int) $winner->score
                    || CarbonImmutable::parse($verified->started_at, 'UTC')->getTimestamp()
                        !== CarbonImmutable::parse($winner->achieved_at, 'UTC')->getTimestamp()) {
                    throw new RuntimeException('Archived winner has no matching verified run.');
                }
                $seen[$winner->player_id] = true;
            }

            // Serialize account erasure against issuance. Once the whole
            // winning cohort is locked, no player can disappear before commit.
            if ($seen) {
                $lockedIds = DB::table('arcade_players')->whereIn('id', array_keys($seen))
                    ->orderBy('id')->lockForUpdate()->pluck('id')->all();
                if (count($lockedIds) !== count($seen)) {
                    throw new RuntimeException('An eligible winner account was erased.');
                }
            }

            DB::table('arcade_reward_batches')->insert([
                'period_key' => $periodKey,
                'settlement_hash' => $period->snapshot_hash,
                'policy_hash' => $policyHash, 'policy_snapshot' => $policyJson,
                'coupon_count' => $winners->count(),
                'issued_at' => $issuedAt, 'created_at' => $issuedAt, 'updated_at' => $issuedAt,
            ]);

            foreach ($winners as $winner) {
                // 128 cryptographically secure bits, unique hashed lookup,
                // never written as cleartext to a database/log/console.
                $code = 'DMN-'.strtoupper(bin2hex(random_bytes(16)));
                $id = DB::table('arcade_coupons')->insertGetId([
                    'period_key' => $periodKey,
                    'winner_id' => $winner->id,
                    'player_id' => $winner->player_id,
                    'game_id' => $winner->game_id,
                    'prize_rank' => $winner->prize_rank,
                    'percent_off' => $policy['tiers'][(int) $winner->prize_rank],
                    'currency' => $policy['currency'],
                    'minimum_minor' => $policy['minimum_minor'],
                    'cap_minor' => $policy['cap_minor'],
                    'code_hash' => hash('sha256', $code),
                    'code_ciphertext' => Crypt::encryptString($code),
                    'status' => 'available', 'expires_at' => $expires->toDateTimeString(),
                    'created_at' => $issuedAt, 'updated_at' => $issuedAt,
                ]);
                DB::table('arcade_coupon_events')->insert([
                    'coupon_id' => $id, 'event_type' => 'issued', 'actor' => 'operator',
                    'order_digest' => null,
                    'details' => json_encode(['policy_hash' => $policyHash,
                        'period_key' => $periodKey, 'rank' => $winner->prize_rank], JSON_THROW_ON_ERROR),
                    'created_at' => $issuedAt,
                ]);
            }

            return ['period_key' => $periodKey, 'status' => 'issued', 'coupons' => $winners->count()];
        }, 3);
    }

    /** Retry skipped completed weeks in order; each batch is atomic. */
    public function issuePending(int $max = 26): array
    {
        $this->policy();
        $weeks = DB::table('arcade_weekly_periods as p')
            ->leftJoin('arcade_reward_batches as b', 'p.period_key', '=', 'b.period_key')
            ->where('p.status', 'sealed')->whereNull('b.period_key')
            ->orderBy('p.period_key')->limit(max(1, min($max, 26)))
            ->pluck('p.period_key')->all();

        $results = [];
        foreach ($weeks as $week) {
            $results[] = $this->issue($week);
        }

        return $results;
    }

}
