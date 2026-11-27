<?php

namespace App\Services\Arcade;

final class RankedGameCatalog
{
    /**
     * Only games with a deterministic, server-side replay verifier may have
     * ranked submissions. Do NOT expose a client-score POST for other games.
     * Adding a verifier is a separate, test-gated change per mini-game.
     */
    public const GAMES = [
        'open-world' => ['title' => 'OPEN WORLD', 'ranked' => false, 'verification' => null],
        'dino-run' => ['title' => 'DINO RUN', 'ranked' => true, 'verification' => 'server-replay'],
        'after-hours' => ['title' => 'AFTER HOURS', 'ranked' => false, 'verification' => null],
        'cafe-rush' => ['title' => 'CAFÉ RUSH', 'ranked' => false, 'verification' => null],
        'cafe-critters' => ['title' => 'CAFÉ CRITTERS', 'ranked' => false, 'verification' => null],
        'cafe-drift' => ['title' => 'CAFÉ DRIFT', 'ranked' => false, 'verification' => null],
        'coffee-crash' => ['title' => 'COFFEE CRASH', 'ranked' => false, 'verification' => null],
    ];

    public function publicList(): array
    {
        return array_map(
            fn (string $id, array $game): array => ['game_id' => $id, ...$game,
                'ranked_scope' => isset(CafeRouteReplayVerifier::VERSIONS[$id])
                    && config('demian-arcade.gameplay_ranked_enabled.'.$id) !== true
                    ? 'route-trial' : 'original-game',
                ...(in_array($id, ['cafe-critters', 'coffee-crash', 'after-hours', 'cafe-rush', 'open-world', 'cafe-drift'], true) && $this->supportsRanked($id)
                    ? ['ranked' => true, 'verification' => 'server-replay'] : [])],
            array_keys(self::GAMES),
            array_values(self::GAMES),
        );
    }

    public function supportsRanked(string $id): bool
    {
        if ($id === 'cafe-drift') return config('demian-arcade.drift_ranked_enabled') === true;
        if ($id === 'cafe-critters') return config('demian-arcade.critters_ranked_enabled') === true;
        if ($id === 'coffee-crash') return config('demian-arcade.coffee_ranked_enabled') === true;
        if (isset(CafeRouteReplayVerifier::VERSIONS[$id])) {
            return config('demian-arcade.gameplay_ranked_enabled.'.$id) === true
                || config('demian-arcade.route_ranked_enabled.'.$id) === true;
        }
        return (self::GAMES[$id]['ranked'] ?? false) === true;
    }
    /** A verified leaderboard does not automatically authorize financial prizes.
     *  Puzzle solvers may automate public answers even with valid server replay.
     *  Commercial eligibility requires a separately approved rollout gate.
     */
    public function requiresPrizeLock(string $id): bool
    {
        return $id === CafeDriftReplayVerifier::GAME_ID
            || isset(MultiGamePrizeReadiness::GAMES[$id]);
    }

    public function prizeEligibleForLock(string $id, ?object $lock, ?string $version = null): bool
    {
        if (!$lock) return !$this->requiresPrizeLock($id) && $this->supportsPrizes($id,$version);
        return (bool)$lock->ranked_enabled && (bool)$lock->prize_eligible
            && ($version === null || $version === $lock->rules_version)
            && $this->supportsPrizes($id,$lock->rules_version,$lock->period_key ?? null);
    }

    public function supportsPrizes(string $id, ?string $version = null, ?string $periodKey = null): bool
    {
        if (! $this->supportsRanked($id)) return false;
        return match ($id) {
            'dino-run' => true,
            'cafe-drift' => config('demian-arcade.drift_prizes_enabled') === true
                && config('demian-coupons.campaigns_enabled') === true
                && config('demian-coupons.issue_enabled') === true
                && config('demian-coupons.policy_approved') === true
                && (config('app.env') !== 'production' || (
                    config('demian-legal.publication_approved') === true
                    && config('demian-legal.require_acceptance') === true))
                && app(DriftPrizeReadiness::class)->approved(),
            'cafe-critters', 'coffee-crash', 'after-hours', 'cafe-rush' => app(MultiGamePrizeReadiness::class)
                ->approved($id, $version, $periodKey),
            'open-world' => false,
            default => false,
        };
    }

}
