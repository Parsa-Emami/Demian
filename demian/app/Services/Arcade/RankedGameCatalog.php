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
        'coffee-crash' => ['title' => 'COFFEE CRASH', 'ranked' => false, 'verification' => null],
    ];

    public function publicList(): array
    {
        return array_map(
            fn (string $id, array $game): array => ['game_id' => $id, ...$game,
                'ranked_scope' => isset(CafeRouteReplayVerifier::VERSIONS[$id])
                    ? 'route-trial' : 'original-game',
                ...(in_array($id, ['cafe-critters', 'coffee-crash', 'after-hours', 'cafe-rush', 'open-world'], true) && $this->supportsRanked($id)
                    ? ['ranked' => true, 'verification' => 'server-replay'] : [])],
            array_keys(self::GAMES),
            array_values(self::GAMES),
        );
    }

    public function supportsRanked(string $id): bool
    {
        if ($id === 'cafe-critters') return config('demian-arcade.critters_ranked_enabled') === true;
        if ($id === 'coffee-crash') return config('demian-arcade.coffee_ranked_enabled') === true;
        if (isset(CafeRouteReplayVerifier::VERSIONS[$id])) {
            return config('demian-arcade.route_ranked_enabled.'.$id) === true;
        }
        return (self::GAMES[$id]['ranked'] ?? false) === true;
    }
    /** A verified leaderboard does not automatically authorize financial prizes.
     *  Puzzle solvers may automate public answers even with valid server replay.
     *  Commercial eligibility requires a separately approved rollout gate.
     */
    public function supportsPrizes(string $id): bool
    {
        if (! $this->supportsRanked($id)) return false;
        return match ($id) {
            'dino-run' => true,
            'cafe-critters' => config('demian-arcade.critters_prizes_enabled') === true,
            'coffee-crash' => config('demian-arcade.coffee_prizes_enabled') === true,
            // A separate route challenge cannot authorize coupons for the original game.
            // Until real-game replay and anti-bot acceptance, this is code-locked OFF.
            'after-hours', 'cafe-rush', 'open-world' => false,
            default => false,
        };
    }

}
