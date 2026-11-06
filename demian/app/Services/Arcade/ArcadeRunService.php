<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use Illuminate\Support\Facades\DB;

final class ArcadeRunService
{
    public function __construct(private readonly RunnerReplayVerifier $verifier) {}

    public function start(ArcadePlayer $player, array $data): ArcadeRun
    {
        $rules = $this->verifier->rules();
        abort_unless($data['rules_version'] === $rules['version'], 409, 'Refresh the game to use current rules.');

        return DB::transaction(function () use ($player, $data, $rules): ArcadeRun {
            ArcadePlayer::query()->lockForUpdate()->findOrFail($player->id);
            $existing = ArcadeRun::query()->where('player_id', $player->id)->where('request_id', $data['request_id'])->first();
            if ($existing) {
                abort_unless($existing->game_id === $data['game_id'] && $existing->character_slug === $data['character_slug']
                    && $existing->track_width === (int) $data['track_width'] && $existing->rules_version === $data['rules_version'], 409, 'Request ID already used.');
                abort_unless($existing->status === 'started' && $existing->expires_at->isFuture(), 409, 'Run is no longer active.');

                return $existing;
            }

            return ArcadeRun::query()->create(['player_id' => $player->id, 'request_id' => $data['request_id'],
                'game_id' => $data['game_id'], 'rules_version' => $rules['version'], 'character_slug' => $data['character_slug'],
                'seed' => random_int(1, 4294967295), 'track_width' => $data['track_width'], 'status' => 'started',
                'started_at' => now(), 'expires_at' => now()->addSeconds($rules['maxTicks'] / $rules['tickRate']
                    + config('demian-arcade.completion_grace_seconds'))]);
        }, 3);
    }

    public function complete(ArcadePlayer $player, ArcadeRun $run, array $data): array
    {
        abort_unless($run->player_id === $player->id, 404);
        $hash = hash('sha256', json_encode(['ticks' => $data['ticks'], 'transitions' => $data['transitions']], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($player, $run, $data, $hash): array {
            ArcadePlayer::query()->lockForUpdate()->findOrFail($player->id);
            $locked = ArcadeRun::query()->lockForUpdate()->findOrFail($run->id);
            if ($locked->status === 'verified') {
                abort_unless(hash_equals($locked->replay_hash, $hash), 409, 'Run already completed with different evidence.');

                return $this->result($locked);
            }
            abort_unless($locked->status === 'started' && $locked->expires_at->isFuture(), 410, 'Run expired.');
            abort_unless($locked->rules_version === $this->verifier->rules()['version'], 409, 'Rules changed. Start a new run.');
            $elapsed = abs($locked->started_at->diffInMilliseconds(now()));
            abort_if($data['ticks'] * 1000 / 60 > $elapsed + 2000, 422, 'Replay is ahead of server time.');
            $score = $this->verifier->verify($locked->seed, $locked->track_width, $data['ticks'], $data['transitions']);
            $locked->fill([...$score, 'status' => 'verified', 'replay_hash' => $hash, 'completed_at' => now()])->save();
            DB::table('arcade_replays')->insert(['run_id' => $locked->id,
                'transitions' => json_encode($data['transitions'], JSON_THROW_ON_ERROR), 'created_at' => now()]);
            foreach (LeaderboardService::periodKeys($locked->started_at) as $period) {
                $key = ['game_id' => $locked->game_id, 'rules_version' => $locked->rules_version,
                    'period_key' => $period, 'player_id' => $player->id];
                $best = DB::table('arcade_leaderboard_entries')->where($key)->first();
                if (! $best || $locked->score > $best->score) DB::table('arcade_leaderboard_entries')->updateOrInsert($key,
                    ['run_id' => $locked->id, 'score' => $locked->score, 'achieved_at' => $locked->started_at]);
            }

            return $this->result($locked);
        }, 3);
    }

    private function result(ArcadeRun $run): array
    {
        return ['run_id' => $run->id, 'status' => $run->status, 'score' => $run->score,
            'ticks' => $run->ticks, 'passed' => $run->passed, 'verification' => 'server-replay', 'rules_version' => $run->rules_version];
    }
}
