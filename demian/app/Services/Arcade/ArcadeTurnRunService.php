<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use DateTimeInterface;
use Domain\Arcade\VerifiedReplay;
use Domain\Arcade\WeeklyContent;
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
    private function versionAllowed(string $game,string $version, DateTimeInterface $at): bool
    {
        if ($game===CafeCrittersReplayVerifier::GAME_ID) {
            return $version === WeeklyContent::effectiveVersion($game, CafeCrittersReplayVerifier::VERSION, $at, config('demian-arcade.weekly_content_at'));
        }
        if ($game===CoffeeCrashReplayVerifier::GAME_ID) {
            return $version === WeeklyContent::effectiveVersion($game, CoffeeCrashReplayVerifier::VERSION, $at, config('demian-arcade.weekly_content_at'));
        }
        if (in_array($game,['after-hours','cafe-rush'],true)) {
            $full = $game==='after-hours'
                ? AfterHoursFrameReplayVerifier::VERSION
                : CafeRushFrameReplayVerifier::VERSION;
            $fullEnabled = config('demian-arcade.gameplay_ranked_enabled.'.$game)===true;
            if ($fullEnabled) return $version === WeeklyContent::effectiveVersion($game, $full, $at, config('demian-arcade.weekly_content_at'));
            return config('demian-arcade.route_ranked_enabled.'.$game)===true
                &&$version===CafeRouteReplayVerifier::VERSIONS[$game];
        }
        if ($game==='open-world') {
            return config('demian-arcade.route_ranked_enabled.open-world')===true
                && $version === WeeklyContent::effectiveVersion($game, CafeRouteReplayVerifier::VERSIONS[$game], $at, config('demian-arcade.weekly_content_at'));
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
            app(ArcadeAntiCheat::class)->assertStartAllowed($player->id);
            $started = now();
            abort_unless($this->versionAllowed($data['game_id'], $data['rules_version'], $started), 409,
                'Refresh game rules before starting a ranked replay.');
            $seed = match ($data['rules_version']) {
                WeeklyContent::version('coffee-crash') => WeeklyContent::coffee(WeeklyContent::index($started), 1)['seed'],
                WeeklyContent::version('cafe-critters') => WeeklyContent::index($started) + 1,
                default => random_int(1, 2147483647),
            };
            $seasonDeadline = app(WeeklyCompetitionService::class)
                ->authorizeNewRun($started, $data['game_id'], $data['rules_version']);
            $requestedExpiry = $started->copy()->addSeconds(
                $this->maximumTicks($data['game_id']) / 60
                + (int) config('demian-arcade.completion_grace_seconds'));
            $expiry = $requestedExpiry->lte($seasonDeadline)
                ? $requestedExpiry : $seasonDeadline;
            $run = ArcadeRun::query()->create([
                'player_id' => $player->id, 'request_id' => $data['request_id'],
                'game_id' => $data['game_id'],
                'rules_version' => $data['rules_version'],
                'character_slug' => 'darya', 'track_width' => 420,
                'seed' => $seed, 'status' => 'started',
                'started_at' => $started, 'expires_at' => $expiry,
            ]);
            app(ArcadeAntiCheat::class)->started($run, request()->ip());
            return $run;
        }, 3);
    }

    public function complete(ArcadePlayer $player, ArcadeRun $run, array $data): array
    {
        $run = ArcadeRun::query()->findOrFail($run->id);
        abort_unless($run->player_id === $player->id
            && in_array($run->game_id, [CafeCrittersReplayVerifier::GAME_ID,
                CoffeeCrashReplayVerifier::GAME_ID, 'after-hours', 'cafe-rush', 'open-world'], true), 404);
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($run->game_id),
            503, 'This game has not passed ranked verification gates.');
        $frameProof = in_array($run->rules_version, [
            AfterHoursFrameReplayVerifier::VERSION, CafeRushFrameReplayVerifier::VERSION,
            WeeklyContent::version('cafe-rush'), WeeklyContent::version('after-hours')
        ],true);
        abort_if($frameProof ? ! isset($data['frames']) : ! isset($data['actions']),
            422, 'Replay payload does not match the signed rules version.');
        $hash = hash('sha256', json_encode([
            'ticks'=>$data['ticks'],
            $frameProof ? 'frames' : 'actions'=>$frameProof
                ? $data['frames'] : $data['actions'],
        ], JSON_THROW_ON_ERROR));

        abort_unless($run->player_id === $player->id, 404);
        if ($run->status === 'verified') {
            abort_unless(hash_equals($run->replay_hash, $hash), 409, 'Run already completed with different evidence.');
            return $this->result($run);
        }
        $authorize = function (ArcadeRun $current) use ($data): void {
            abort_unless($current->status === 'started' && $current->expires_at->isFuture(), 410, 'Run expired.');
            abort_unless(app(RankedGameCatalog::class)->supportsRanked($current->game_id), 503,
                'This game has not passed ranked verification gates.');
            abort_unless($this->versionAllowed($current->game_id, $current->rules_version, $current->started_at), 409,
                'Rules version changed or rollout revoked.');
            $elapsed = max(0, $current->started_at->diffInMilliseconds(now()));
            abort_if($data['ticks'] * 1000 / 60 > $elapsed + 2000, 422, 'Replay is ahead of server wall-clock time.');
        };
        $authorize($run);
        $week = WeeklyContent::index($run->started_at);
        $verified = match ($run->rules_version) {
            WeeklyContent::version('coffee-crash') =>
                $this->coffee->verify((int) $run->seed, $data['ticks'], $data['actions'], WeeklyContent::coffee($week, 1)),
            WeeklyContent::version('cafe-critters') =>
                $this->critters->verify((int) $run->seed, $data['ticks'], $data['actions'], $week),
            WeeklyContent::version('cafe-rush') =>
                $this->rushFrames->verify((int) $run->seed, $data['ticks'], $data['frames'], assisted: true, week: $week),
            WeeklyContent::version('after-hours') =>
                $this->afterFrames->verify((int) $run->seed, $data['ticks'], $data['frames'], week: $week),
            WeeklyContent::version('open-world') =>
                $this->routes->verify($run->game_id, (int) $run->seed, $data['ticks'], $data['actions'], $week),
            AfterHoursFrameReplayVerifier::VERSION =>
                $this->afterFrames->verify((int) $run->seed, $data['ticks'], $data['frames']),
            CafeRushFrameReplayVerifier::VERSION =>
                $this->rushFrames->verify((int) $run->seed, $data['ticks'], $data['frames']),
            default => isset(CafeRouteReplayVerifier::VERSIONS[$run->game_id])
                ? $this->routes->verify($run->game_id, (int) $run->seed, $data['ticks'], $data['actions'])
                : ($run->game_id === CoffeeCrashReplayVerifier::GAME_ID
                    ? $this->coffee->verify((int) $run->seed, $data['ticks'], $data['actions'])
                    : $this->critters->verify((int) $run->seed, $data['ticks'], $data['actions'])),
        };
        $proof = new VerifiedReplay($run->getRawOriginal(), $hash, $verified,
            $frameProof ? $data['frames'] : $data['actions']);
        return $this->result(app(ReplayCompletionService::class)->commit($player, $proof, $authorize));
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
