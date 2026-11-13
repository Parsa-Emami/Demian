<?php

use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Non-destructive switch from ISO-Monday UTC keys to Saturday Tehran keys.
 * Reconstruct per-player seasonal bests from retained verified runs, not from
 * legacy weekly aggregates (which can straddle a Tehran season boundary).
 * Old period rows remain for audit/rollback; this operation is idempotent.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('arcade_runs')->where('status', 'verified')
            ->orderBy('id')->chunkById(250, function ($runs): void {
                foreach ($runs as $run) {
                    $seasonStart = CarbonImmutable::parse($run->started_at, 'UTC')
                        ->setTimezone('Asia/Tehran')->startOfWeek(CarbonImmutable::SATURDAY);
                    $key = [
                        'game_id' => $run->game_id,
                        'rules_version' => $run->rules_version,
                        'period_key' => 'weekly:tehran:'.$seasonStart->format('Y-m-d'),
                        'player_id' => $run->player_id,
                    ];
                    $existing = DB::table('arcade_leaderboard_entries')->where($key)->first();
                    $better = ! $existing
                        || (int) $run->score > (int) $existing->score
                        || ((int) $run->score === (int) $existing->score
                            && strcmp((string) $run->started_at, (string) $existing->achieved_at) < 0);
                    if ($better) {
                        DB::table('arcade_leaderboard_entries')->updateOrInsert($key, [
                            'run_id' => $run->id,
                            'score' => $run->score,
                            'achieved_at' => $run->started_at,
                        ]);
                    }
                }
            }, 'id');
    }

    public function down(): void
    {
        // Do not erase newer weekly scores: this migration only adds keys.
        // Deployments reverting the contract must explicitly reconcile history.
    }
};
