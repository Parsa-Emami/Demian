<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use Illuminate\Support\Facades\DB;

/**
 * Isolated turn-replay API. Dino Run's physics verifier remains unchanged.
 * Other games are NOT accepted until independent deterministic verifiers exist.
 */
final class ArcadeTurnRunService
{
    public function __construct(private readonly CafeCrittersReplayVerifier $critters,
        private readonly CoffeeCrashReplayVerifier $coffee,
        private readonly CafeRouteReplayVerifier $routes,
        private readonly AfterHoursFrameReplayVerifier $afterFrames,
        private readonly CafeRushFrameReplayVerifier $rushFrames) {}

    /** Exactly one ruleset per game may be publicly ranked at a time.
     * Explicitly gate newly versioned ORIGINAL-game replays. Old route trials
     * remain available only when gameplay mode is OFF.
     */
    private function versionAllowed(string $game,string $version): bool
    {
        if ($game===CafeCrittersReplayVerifier::GAME_ID) {
            return $version===CafeCrittersReplayVerifier::VERSION;
        }
        if ($game===CoffeeCrashReplayVerifier::GAME_ID) {
            return $version===CoffeeCrashReplayVerifier::VERSION;
        }
        if (in_array($game,['after-hours','cafe-rush'],true)) {
            $full = $game==='after-hours'
                ? AfterHoursFrameReplayVerifier::VERSION
                : CafeRushFrameReplayVerifier::VERSION;
            $fullEnabled = config('demian-arcade.gameplay_ranked_enabled.'.$game)===true;
            if ($fullEnabled) return $version===$full;
            return config('demian-arcade.route_ranked_enabled.'.$game)===true
                &&$version===CafeRouteReplayVerifier::VERSIONS[$game];
        }
        if ($game==='open-world') {
            return config('demian-arcade.route_ranked_enabled.open-world')===true
                &&$version===CafeRouteReplayVerifier::VERSIONS[$game];
        }
        return false;
    }

    private function maximumTicks(string $game): int
    {
        return isset(CafeRouteReplayVerifier::VERSIONS[$game])
            ? $this->routes->seconds($game)*60
            : ($game === CoffeeCrashReplayVerifier::GAME_ID
                ? CoffeeCrashReplayVerifier::MAX_TICKS : CafeCrittersReplayVerifier::MAX_TICKS);
    }

    public function start(ArcadePlayer $player, array $data): ArcadeRun
    {
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($data['game_id']),
            503, 'This game has not passed ranked verification gates.');
        abort_unless($this->versionAllowed($data['game_id'], $data['rules_version']), 409,
            'Refresh game rules before starting a ranked replay.');

        return DB::transaction(function () use ($player, $data): ArcadeRun {
            ArcadePlayer::query()->lockForUpdate()->findOrFail($player->id);
            $existing = ArcadeRun::query()->where('player_id', $player->id)
                ->where('request_id', $data['request_id'])->first();
            if ($existing) {
                abort_unless($existing->game_id === $data['game_id']
                    && $existing->rules_version === $data['rules_version']
                    && $existing->status === 'started' && $existing->expires_at->isFuture(),
                    409, 'Run identifier already used.');
                return $existing;
            }
            app(WeeklySettlementService::class)->assertOpenForCompletion(now());
            return ArcadeRun::query()->create([
                'player_id' => $player->id, 'request_id' => $data['request_id'],
                'game_id' => $data['game_id'],
                'rules_version' => $data['rules_version'],
                'character_slug' => 'darya', 'track_width' => 420,
                'seed' => random_int(1, 2147483647), 'status' => 'started',
                'started_at' => now(), 'expires_at' => now()->addSeconds(
                    $this->maximumTicks($data['game_id']) / 60
                    + (int) config('demian-arcade.completion_grace_seconds')),
            ]);
        }, 3);
    }

    public function complete(ArcadePlayer $player, ArcadeRun $run, array $data): array
    {
        abort_unless($run->player_id === $player->id
            && in_array($run->game_id, [CafeCrittersReplayVerifier::GAME_ID,
                CoffeeCrashReplayVerifier::GAME_ID, 'after-hours', 'cafe-rush', 'open-world'], true), 404);
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($run->game_id),
            503, 'This game has not passed ranked verification gates.');
        $frameProof = in_array($run->rules_version, [
            AfterHoursFrameReplayVerifier::VERSION,CafeRushFrameReplayVerifier::VERSION
        ],true);
        abort_if($frameProof ? ! isset($data['frames']) : ! isset($data['actions']),
            422, 'Replay payload does not match the signed rules version.');
        $hash = hash('sha256', json_encode([
            'ticks'=>$data['ticks'],
            $frameProof ? 'frames' : 'actions'=>$frameProof
                ? $data['frames'] : $data['actions'],
        ], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($player, $run, $data, $hash, $frameProof): array {
            ArcadePlayer::query()->lockForUpdate()->findOrFail($player->id);
            $locked = ArcadeRun::query()->lockForUpdate()->findOrFail($run->id);
            if ($locked->status === 'verified') {
                abort_unless(hash_equals($locked->replay_hash, $hash), 409,
                    'Run already completed with different evidence.');
                return $this->result($locked);
            }
            abort_unless($locked->status === 'started' && $locked->expires_at->isFuture(),
                410, 'Run expired.');
            abort_unless($this->versionAllowed($locked->game_id,$locked->rules_version),
                409, 'Rules version changed or rollout revoked.');
            app(WeeklySettlementService::class)->assertOpenForCompletion($locked->started_at);
            $elapsed = abs($locked->started_at->diffInMilliseconds(now()));
            abort_if($data['ticks'] * 1000 / 60 > $elapsed + 2000, 422,
                'Replay is ahead of server wall-clock time.');
            $verified = match ($locked->rules_version) {
                AfterHoursFrameReplayVerifier::VERSION =>
                    $this->afterFrames->verify((int)$locked->seed,$data['ticks'],$data['frames']),
                CafeRushFrameReplayVerifier::VERSION =>
                    $this->rushFrames->verify((int)$locked->seed,$data['ticks'],$data['frames']),
                default => isset(CafeRouteReplayVerifier::VERSIONS[$locked->game_id])
                    ? $this->routes->verify($locked->game_id,
                        (int) $locked->seed, $data['ticks'], $data['actions'])
                    : ($locked->game_id === CoffeeCrashReplayVerifier::GAME_ID
                        ? $this->coffee->verify((int) $locked->seed, $data['ticks'], $data['actions'])
                        : $this->critters->verify((int) $locked->seed, $data['ticks'], $data['actions'])),
            };
            $locked->fill([...$verified, 'status' => 'verified',
                'replay_hash' => $hash, 'completed_at' => now()])->save();
            // Current arcade_replays.transitions is an event-evidence JSON column.
            DB::table('arcade_replays')->insert([
                'run_id' => $locked->id,
                'transitions' => json_encode($frameProof
                    ? $data['frames'] : $data['actions'],JSON_THROW_ON_ERROR),
                'created_at' => now(),
            ]);
            foreach (LeaderboardService::periodKeys($locked->started_at) as $period) {
                $key = [
                    'game_id' => $locked->game_id,
                    'rules_version' => $locked->rules_version,
                    'period_key' => $period, 'player_id' => $player->id,
                ];
                $best = DB::table('arcade_leaderboard_entries')->where($key)->first();
                $better = ! $best || $locked->score > $best->score
                    || ($locked->score === (int) $best->score
                        && $locked->started_at->lt(
                            \Carbon\CarbonImmutable::parse($best->achieved_at, 'UTC')));
                if ($better) {
                    DB::table('arcade_leaderboard_entries')->updateOrInsert($key, [
                        'run_id' => $locked->id, 'score' => $locked->score,
                        'achieved_at' => $locked->started_at,
                    ]);
                }
            }
            return $this->result($locked);
        }, 3);
    }

    private function result(ArcadeRun $run): array
    {
        return [
            'run_id' => $run->id, 'game_id' => $run->game_id,
            'status' => $run->status, 'score' => $run->score,
            'ticks' => $run->ticks, 'passed' => $run->passed,
            'rules_version' => $run->rules_version, 'verification' => 'server-replay',
        ];
    }
}
