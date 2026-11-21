<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class WeeklyAllocationService
{
    public function required(): bool
    {
        return ! app()->environment('testing') || config('demian-coupons.dynamic_allocation_required') === true;
    }

    public function plan(object $campaign, array $rankings, array $historical, array $excluded, bool $sealing = false): ?array
    {
        $terms = json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR);
        if (! array_key_exists('allocation', $terms)) return null;
        $policy = DynamicWinnerAllocation::canonical($terms['allocation']);
        // Include eligible games with no submissions in the management table.
        $locks = DB::table('arcade_weekly_rule_locks')->where('period_key', $campaign->period_key)->get()->keyBy('game_id');
        $catalog = app(RankedGameCatalog::class);
        foreach ($policy['game_caps'] as $game => $limit) {
            $lock = $locks->get($game);
            if ($catalog->supportsPrizes($game) && ($lock ? $lock->ranked_enabled && $lock->prize_eligible : $game !== CafeDriftReplayVerifier::GAME_ID)) {
                $rankings[$game] ??= [];
            }
        }
        // Verify frozen campaign hash, capacity and financial terms.
        $economics = app(CampaignEconomics::class)->frozen($campaign, $sealing);
        if (! $economics) throw new RuntimeException('Dynamic allocation needs a budgeted campaign.');
        $cap = (int) $terms['max_discount_minor'];
        $capacity = min((int) $campaign->max_awards, intdiv($economics['budget_minor'], $cap));
        $plan = app(DynamicWinnerAllocation::class)->allocate($rankings, $historical, $excluded, $capacity, $policy);
        $available = DB::table('arcade_reward_inventory')->where('campaign_id', $campaign->id)
            ->where('status', 'available')->count();
        $summary = &$plan['summary'];
        $summary['campaign_id'] = (int) $campaign->id;
        $summary['terms_hash'] = $campaign->terms_hash;
        $summary['budget_minor'] = $economics['budget_minor'];
        $summary['coupon_cap_minor'] = $cap;
        $summary['maximum_commitment_minor'] = $summary['winner_count'] * $cap;
        $summary['inventory_available'] = $available;
        $summary['ready'] = $campaign->status === 'active' && $available >= $summary['winner_count'];
        if ($sealing && $summary['winner_count'] > 0 && ! $summary['ready']) {
            throw new RuntimeException('Dynamic prize campaign is not active or inventory is insufficient; retry settlement.');
        }
        if ($sealing && $summary['winner_count'] > 0) {
            app(CampaignEconomics::class)->assertIssuance($campaign, $summary['winner_count']);
        }
        return $plan;
    }

    /** Aggregate-only read path. Same eligibility, score order, exclusions,
     * allocation algorithm as settlement; read-only, provisional and no IDs. */
    public function preview(object $campaign): ?array
    {
        $terms = json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR);
        if (! isset($terms['allocation'])) return null;
        $period = DB::table('arcade_weekly_periods')->where('period_key', $campaign->period_key)->first();
        if (! $period) throw new RuntimeException('Missing allocation season.');
        if ($period->status === 'sealed') {
            $details = $this->sealedDetails($period->period_key);
            return $details ? [...$details, 'status' => 'sealed'] : null;
        }
        $locks = DB::table('arcade_weekly_rule_locks')->where('period_key', $period->period_key)->get()->keyBy('game_id');
        $catalog = app(RankedGameCatalog::class);
        $rows = DB::table('arcade_leaderboard_entries as e')->join('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->join('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->where('e.period_key', $period->period_key)->where('r.status', 'verified')
            ->whereNotNull('r.replay_hash')->whereNotNull('r.completed_at')
            ->whereColumn('e.player_id', 'r.player_id')->whereColumn('e.game_id', 'r.game_id')
            ->whereColumn('e.rules_version', 'r.rules_version')->whereColumn('e.score', 'r.score')
            ->whereColumn('e.achieved_at', 'r.started_at')
            ->where('r.started_at', '>=', $period->starts_at)->where('r.started_at', '<', $period->ends_at)
            ->get(['e.player_id', 'e.game_id', 'e.rules_version', 'e.score', 'e.achieved_at']);
        $rankings = []; $versions = [];
        foreach ($rows as $row) {
            $lock = $locks->get($row->game_id);
            if (! $catalog->supportsPrizes($row->game_id)
                || ($lock ? (! $lock->ranked_enabled || ! $lock->prize_eligible || $lock->rules_version !== $row->rules_version)
                    : $row->game_id === CafeDriftReplayVerifier::GAME_ID)) continue;
            $versions[$row->game_id][$row->rules_version] = true;
            $rankings[$row->game_id][] = ['player_id' => $row->player_id, 'score' => (int) $row->score,
                'achieved_at' => $row->achieved_at, 'verified' => true];
        }
        foreach ($versions as $gameVersions) {
            if (count($gameVersions) !== 1) throw new RuntimeException('Mixed scoring versions in preview.');
        }
        $historical = DB::table('arcade_weekly_winners')->where('period_key', '<', $period->period_key)
            ->whereNotNull('player_id')->distinct()->pluck('player_id')->all();
        $excluded = DB::table('arcade_coupons')->where('source', 'weekly')->whereNotNull('player_id')
            ->whereIn('status', ['issued', 'reserved'])->where('expires_at', '>', now()->utc()->toDateTimeString())
            ->distinct()->pluck('player_id')->all();
        $plan = $this->plan($campaign, $rankings, $historical, $excluded);
        return [...$plan['summary'], 'status' => 'provisional'];
    }

    public function sealedDetails(string $period): ?array
    {
        $row = DB::table('arcade_weekly_settlement_events')->where('period_key', $period)
            ->where('event_type', 'sealed')->orderBy('id')->first();
        if (! $row) return null;
        $details = json_decode($row->details, true, 512, JSON_THROW_ON_ERROR);
        return $details['allocation'] ?? null;
    }

    public function assertSealed(object $campaign, iterable $winners): void
    {
        $terms = json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR);
        if (! isset($terms['allocation'])) return;
        $details = $this->sealedDetails($campaign->period_key);
        if (! $details || ($details['algorithm'] ?? null) !== DynamicWinnerAllocation::VERSION
            || ($details['campaign_id'] ?? null) !== (int) $campaign->id
            || ($details['terms_hash'] ?? null) !== $campaign->terms_hash
            || ! is_string($details['winner_sha256'] ?? null)
            || ! hash_equals($details['winner_sha256'], DynamicWinnerAllocation::winnerDigest($winners))) {
            throw new RuntimeException('Frozen dynamic award proof mismatch.');
        }
        $counts = [];
        foreach ($winners as $winner) {
            $game = $winner->game_id;
            $counts[$game] = ($counts[$game] ?? 0) + 1;
        }
        $total = array_sum($counts);
        if ($total !== $details['winner_count'] || $total > $details['funded_capacity']
            || $total * (int) $terms['max_discount_minor'] !== $details['maximum_commitment_minor']) {
            throw new RuntimeException('Frozen dynamic award budget mismatch.');
        }
        foreach ($counts as $game => $count) {
            if ($count !== ($details['games'][$game]['winners'] ?? null)
                || $count > ($details['games'][$game]['quota'] ?? 0)) {
                throw new RuntimeException('Frozen per-game prize quota mismatch.');
            }
        }
    }
}
