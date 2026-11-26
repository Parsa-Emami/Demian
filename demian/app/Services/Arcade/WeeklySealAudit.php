<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Independently checks an immutable technical ranking and recipient snapshot.
 * Read-only. No prizes, rank changes or automatic recovery are permitted.
 *
 * Called under the caller's weekly-period lock. It deliberately uses the
 * original Phase 7b JSON field order so hashes remain stable on existing DBs.
 */
final class WeeklySealAudit
{
    public function assertSealed(object $period): void
    {
        if ($period->status !== 'sealed' || ! is_string($period->snapshot_hash)
            || preg_match('/^[a-f0-9]{64}$/D', $period->snapshot_hash) !== 1) {
            throw new RuntimeException('Weekly period is not sealed with a valid snapshot hash.');
        }

        $rankings = DB::table('arcade_weekly_results')
            ->where('period_key', $period->period_key)
            ->orderBy('game_id')->orderBy('technical_rank')->get();
        $canonical = [];
        foreach ($rankings as $row) {
            $canonical[] = [
                'period_key' => $row->period_key,
                'game_id' => $row->game_id,
                'rules_version' => $row->rules_version,
                'player_id' => $row->player_id,
                'run_id' => $row->run_id,
                'score' => (int) $row->score,
                'achieved_at' => $row->achieved_at,
                'technical_rank' => (int) $row->technical_rank,
                'created_at' => $row->created_at,
            ];
        }
        $computed = hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR));
        if (count($canonical) !== (int) $period->participants
            || ! hash_equals($period->snapshot_hash, $computed)) {
            throw new RuntimeException('Sealed weekly ranking snapshot was modified or truncated.');
        }

        $winners = DB::table('arcade_weekly_winners')
            ->where('period_key', $period->period_key)->get();
        if ($winners->count() !== (int) $period->winner_count) {
            throw new RuntimeException('Sealed weekly winner count mismatch.');
        }

        $seen = [];
        foreach ($winners as $winner) {
            $key = $winner->game_id.'|'.$winner->prize_rank;
            if ((int) $winner->prize_rank < 1 || isset($seen[$key])) {
                throw new RuntimeException('Sealed weekly winners have duplicate or invalid prize ranks.');
            }
            $seen[$key] = true;
            $matched = $rankings->contains(static fn (object $row): bool =>
                $row->game_id === $winner->game_id
                && $row->rules_version === $winner->rules_version
                && $row->player_id === $winner->player_id
                && $row->run_id === $winner->run_id
                && (int) $row->score === (int) $winner->score
                && (int) $row->technical_rank === (int) $winner->technical_rank
                && $row->achieved_at === $winner->achieved_at);
            if (! $matched) {
                throw new RuntimeException('Sealed weekly winner is not proven by the immutable ranking.');
            }
        }
    }
}
