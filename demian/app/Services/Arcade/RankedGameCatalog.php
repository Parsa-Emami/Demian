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
        'dino-run' => ['title' => 'DINO RUN', 'ranked' => true, 'verification' => 'server-replay'],
        'after-hours' => ['title' => 'AFTER HOURS', 'ranked' => false, 'verification' => null],
        'cafe-rush' => ['title' => 'CAFÉ RUSH', 'ranked' => false, 'verification' => null],
        'cafe-critters' => ['title' => 'CAFÉ CRITTERS', 'ranked' => false, 'verification' => null],
        'coffee-crash' => ['title' => 'COFFEE CRASH', 'ranked' => false, 'verification' => null],
    ];

    public function publicList(): array
    {
        return array_map(
            static fn (string $id, array $game): array => ['game_id' => $id, ...$game],
            array_keys(self::GAMES),
            array_values(self::GAMES),
        );
    }

    public function supportsRanked(string $id): bool
    {
        return (self::GAMES[$id]['ranked'] ?? false) === true;
    }
}
