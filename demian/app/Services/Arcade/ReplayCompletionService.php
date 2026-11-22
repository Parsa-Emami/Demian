<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use Carbon\CarbonImmutable;
use Domain\Arcade\VerifiedReplay;
use Illuminate\Support\Facades\DB;

final class ReplayCompletionService
{
    public function commit(ArcadePlayer $player, VerifiedReplay $proof, callable $authorize): ArcadeRun
    {
        return DB::transaction(function () use ($player, $proof, $authorize): ArcadeRun {
            ArcadePlayer::query()->lockForUpdate()->findOrFail($player->id);
            $run = ArcadeRun::query()->lockForUpdate()->findOrFail($proof->identity['id']);
            abort_unless($run->player_id === $player->id, 404);
            abort_unless($proof->matches($run->getRawOriginal()), 409, 'Run changed during verification.');
            if ($run->status === 'verified') {
                abort_unless(hash_equals($run->replay_hash, $proof->hash), 409,
                    'Run already completed with different evidence.');
                return $run;
            }
            $authorize($run);
            app(WeeklySettlementService::class)->assertOpenForCompletion($run->started_at);
            $run->fill([...$proof->score, 'status' => 'verified', 'replay_hash' => $proof->hash,
                'completed_at' => now()])->save();
            DB::table('arcade_replays')->insert(['run_id' => $run->id,
                'transitions' => json_encode($proof->evidence, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            foreach (LeaderboardService::periodKeys($run->started_at) as $period) {
                $key = ['game_id' => $run->game_id, 'rules_version' => $run->rules_version,
                    'period_key' => $period, 'player_id' => $player->id];
                $best = DB::table('arcade_leaderboard_entries')->where($key)->first();
                $better = ! $best || $run->score > $best->score
                    || ($run->score === (int) $best->score
                        && $run->started_at->lt(CarbonImmutable::parse($best->achieved_at, 'UTC')));
                if ($better) DB::table('arcade_leaderboard_entries')->updateOrInsert($key,
                    ['run_id' => $run->id, 'score' => $run->score, 'achieved_at' => $run->started_at]);
            }
            app(ArcadeAntiCheat::class)->verified($run, count($proof->evidence), request()->ip());
            return $run;
        }, 3);
    }
}
