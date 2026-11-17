<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use Domain\Arcade\VerifiedReplay;
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

            app(ArcadeAntiCheat::class)->assertStartAllowed($player->id);
            $started = now();
            $seasonDeadline = app(WeeklyCompetitionService::class)
                ->authorizeNewRun($started, $data['game_id'], $rules['version']);
            $requestedExpiry = $started->copy()->addSeconds(
                $rules['maxTicks'] / $rules['tickRate']
                + (int) config('demian-arcade.completion_grace_seconds'));
            $expiry = $requestedExpiry->lte($seasonDeadline)
                ? $requestedExpiry : $seasonDeadline;

            $run = ArcadeRun::query()->create(['player_id' => $player->id, 'request_id' => $data['request_id'],
                'game_id' => $data['game_id'], 'rules_version' => $rules['version'], 'character_slug' => $data['character_slug'],
                'seed' => random_int(1, 4294967295), 'track_width' => $data['track_width'], 'status' => 'started',
                'started_at' => $started, 'expires_at' => $expiry]);
            app(ArcadeAntiCheat::class)->started($run, request()->ip());
            return $run;
        }, 3);
    }

    public function complete(ArcadePlayer $player, ArcadeRun $run, array $data): array
    {
        $run = ArcadeRun::query()->findOrFail($run->id);
        abort_unless($run->player_id === $player->id, 404);
        $hash = hash('sha256', json_encode(['ticks' => $data['ticks'], 'transitions' => $data['transitions']], JSON_THROW_ON_ERROR));

        if ($run->status === 'verified') {
            abort_unless(hash_equals($run->replay_hash, $hash), 409, 'Run already completed with different evidence.');
            return $this->result($run);
        }
        $authorize = function (ArcadeRun $current) use ($data): void {
            abort_unless($current->status === 'started' && $current->expires_at->isFuture(), 410, 'Run expired.');
            abort_unless($current->rules_version === $this->verifier->rules()['version'], 409, 'Rules changed. Start a new run.');
            $elapsed = max(0, $current->started_at->diffInMilliseconds(now()));
            abort_if($data['ticks'] * 1000 / 60 > $elapsed + 2000, 422, 'Replay is ahead of server time.');
        };
        $authorize($run);
        $score = $this->verifier->verify($run->seed, $run->track_width, $data['ticks'], $data['transitions']);
        $proof = new VerifiedReplay($run->getRawOriginal(), $hash, $score, $data['transitions']);
        return $this->result(app(ReplayCompletionService::class)->commit($player, $proof, $authorize));
    }

    private function result(ArcadeRun $run): array
    {
        return ['run_id' => $run->id, 'status' => $run->status, 'score' => $run->score,
            'ticks' => $run->ticks, 'passed' => $run->passed, 'verification' => 'server-replay', 'rules_version' => $run->rules_version];
    }
}
