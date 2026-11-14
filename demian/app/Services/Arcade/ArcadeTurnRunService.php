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
        private readonly CoffeeCrashReplayVerifier $coffee) {}

    private function version(string $game): string
    {
        return match ($game) {
            CafeCrittersReplayVerifier::GAME_ID => CafeCrittersReplayVerifier::VERSION,
            CoffeeCrashReplayVerifier::GAME_ID => CoffeeCrashReplayVerifier::VERSION,
            default => abort(422, 'No trusted verifier for this game.'),
        };
    }

    private function maximumTicks(string $game): int
    {
        return $game === CoffeeCrashReplayVerifier::GAME_ID
            ? CoffeeCrashReplayVerifier::MAX_TICKS : CafeCrittersReplayVerifier::MAX_TICKS;
    }

    public function start(ArcadePlayer $player, array $data): ArcadeRun
    {
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($data['game_id']),
            503, 'This game has not passed ranked verification gates.');
        abort_unless($data['rules_version'] === $this->version($data['game_id']), 409,
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
                'rules_version' => $this->version($data['game_id']),
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
                CoffeeCrashReplayVerifier::GAME_ID], true), 404);
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($run->game_id),
            503, 'This game has not passed ranked verification gates.');
        $hash = hash('sha256', json_encode([
            'ticks' => $data['ticks'], 'actions' => $data['actions']
        ], JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($player, $run, $data, $hash): array {
            ArcadePlayer::query()->lockForUpdate()->findOrFail($player->id);
            $locked = ArcadeRun::query()->lockForUpdate()->findOrFail($run->id);
            if ($locked->status === 'verified') {
                abort_unless(hash_equals($locked->replay_hash, $hash), 409,
                    'Run already completed with different evidence.');
                return $this->result($locked);
            }
            abort_unless($locked->status === 'started' && $locked->expires_at->isFuture(),
                410, 'Run expired.');
            abort_unless($locked->rules_version === $this->version($locked->game_id),
                409, 'Rules version changed.');
            app(WeeklySettlementService::class)->assertOpenForCompletion($locked->started_at);
            $elapsed = abs($locked->started_at->diffInMilliseconds(now()));
            abort_if($data['ticks'] * 1000 / 60 > $elapsed + 2000, 422,
                'Replay is ahead of server wall-clock time.');
            $verified = $locked->game_id === CoffeeCrashReplayVerifier::GAME_ID
                ? $this->coffee->verify((int) $locked->seed, $data['ticks'], $data['actions'])
                : $this->critters->verify((int) $locked->seed, $data['ticks'], $data['actions']);
            $locked->fill([...$verified, 'status' => 'verified',
                'replay_hash' => $hash, 'completed_at' => now()])->save();
            // Current arcade_replays.transitions is an event-evidence JSON column.
            DB::table('arcade_replays')->insert([
                'run_id' => $locked->id,
                'transitions' => json_encode($data['actions'], JSON_THROW_ON_ERROR),
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
