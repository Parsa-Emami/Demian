<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;

final class ArcadeIntegrityAudit
{
    /**
     * Read-only consistency checks. Never delete, repair or expose player data.
     * Old verified replay inputs may be pruned by retention policy, so only
     * recently completed runs must still have replay evidence.
     */
    public function inspect(): array
    {
        $brokenRankings = DB::table('arcade_leaderboard_entries as e')
            ->leftJoin('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->leftJoin('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->where(function ($query): void {
                $query->whereNull('r.id')
                    ->orWhereNull('p.id')
                    ->orWhere('r.status', '<>', 'verified')
                    ->orWhereColumn('e.player_id', '<>', 'r.player_id')
                    ->orWhereColumn('e.game_id', '<>', 'r.game_id')
                    ->orWhereColumn('e.rules_version', '<>', 'r.rules_version')
                    ->orWhereColumn('e.score', '<>', 'r.score')
                    ->orWhereColumn('e.achieved_at', '<>', 'r.started_at');
            })->count();

        $invalidVerifiedRuns = DB::table('arcade_runs')
            ->where('status', 'verified')
            ->where(function ($query): void {
                $query->whereNull('replay_hash')->orWhereNull('completed_at');
            })->count();

        $missingRecentEvidence = DB::table('arcade_runs as r')
            ->leftJoin('arcade_replays as evidence', 'evidence.run_id', '=', 'r.id')
            ->where('r.status', 'verified')
            ->where('r.completed_at', '>=', now()->subDays(
                (int) config('demian-arcade.replay_retention_days', 30)))
            ->whereNull('evidence.run_id')->count();

        $unboundedSessions = DB::table('arcade_players')
            ->whereNull('token_expires_at')->count();

        $checks = [
            'broken_leaderboard_entries' => $brokenRankings,
            'invalid_verified_runs' => $invalidVerifiedRuns,
            'missing_recent_replay_evidence' => $missingRecentEvidence,
            'unbounded_player_sessions' => $unboundedSessions,
        ];
        return ['status' => array_sum($checks) === 0 ? 'ok' : 'inconsistent', 'checks' => $checks];
    }
}
