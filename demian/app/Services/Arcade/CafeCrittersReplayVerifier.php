<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * Versioned action-replay of the actual CafeCrittersModel.select/invite/next
 * transitions. The server chooses the three guests; no client score, guest
 * identity or claimed success is trusted.
 *
 * Rules v1 use the game's standard difficulty and 240-second round with the
 * same 8 guest settings / TURN_PAGES=3 as CafeCrittersData.js.
 */
final class CafeCrittersReplayVerifier
{
    public const GAME_ID = 'cafe-critters';
    public const VERSION = 'cafe-critters-replay-v1';
    public const TICKS_PER_SECOND = 60;
    public const MAX_TICKS = 240 * self::TICKS_PER_SECOND;
    public const MAX_ACTIONS = 240;

    public const GUESTS = [
        ['id' => 'hali', 'light' => 'moon', 'food' => 'cardamom', 'decor' => 'vase'],
        ['id' => 'rosha', 'light' => 'sun', 'food' => 'berries', 'decor' => 'ribbon'],
        ['id' => 'varagh', 'light' => 'sun', 'food' => 'seeds', 'decor' => 'book'],
        ['id' => 'tootak', 'light' => 'moon', 'food' => 'berries', 'decor' => 'book'],
        ['id' => 'noktak', 'light' => 'sun', 'food' => 'cardamom', 'decor' => 'ribbon'],
        ['id' => 'shabpar', 'light' => 'moon', 'food' => 'seeds', 'decor' => 'ribbon'],
        ['id' => 'danerou', 'light' => 'sun', 'food' => 'seeds', 'decor' => 'vase'],
        ['id' => 'abri', 'light' => 'moon', 'food' => 'cardamom', 'decor' => 'book'],
    ];

    public function targetIds(int $seed): array
    {
        $start = $seed % count(self::GUESTS);
        return array_map(static fn (array $g): string => $g['id'],
            array_slice(array_merge(
                array_slice(self::GUESTS, $start),
                array_slice(self::GUESTS, 0, $start)
            ), 0, 3));
    }

    public function verify(int $seed, int $ticks, array $actions): array
    {
        $invalid = static fn (string $message): ValidationException =>
            ValidationException::withMessages(['replay' => $message]);
        if ($ticks < 1 || $ticks > self::MAX_TICKS || count($actions) < 12
            || count($actions) > self::MAX_ACTIONS) {
            throw $invalid('Invalid replay length.');
        }

        $guests = array_slice(array_merge(
            array_slice(self::GUESTS, $seed % count(self::GUESTS)),
            array_slice(self::GUESTS, 0, $seed % count(self::GUESTS))
        ), 0, 3);
        $fields = [
            'light' => ['sun', 'moon'],
            'food' => ['cardamom', 'berries', 'seeds'],
            'decor' => ['vase', 'book', 'ribbon'],
        ];

        $page = 0; $lastTick = -1; $misses = 0; $pageStart = 0;
        $selection = ['light' => null, 'food' => null, 'decor' => null];
        $attempts = []; $visiting = false; $finished = false;
        foreach ($actions as $entry) {
            if (! is_array($entry) || ! is_int($entry['tick'] ?? null)
                || ! is_string($entry['kind'] ?? null)
                || $entry['tick'] <= $lastTick || $entry['tick'] >= $ticks
                || $entry['tick'] < 0) {
                throw $invalid('Replay events must have increasing ticks.');
            }
            $lastTick = $entry['tick'];
            if ($finished) throw $invalid('Events continue after completion.');
            switch ($entry['kind']) {
                case 'select':
                    if ($visiting || ! is_string($entry['field'] ?? null)
                        || ! is_string($entry['option'] ?? null)
                        || ! isset($fields[$entry['field']])
                        || ! in_array($entry['option'], $fields[$entry['field']], true)
                        || $selection[$entry['field']] === $entry['option']) {
                        throw $invalid('Invalid table selection.');
                    }
                    $selection[$entry['field']] = $entry['option'];
                    break;
                case 'invite':
                    if ($visiting || in_array(null, $selection, true)) {
                        throw $invalid('Inviting requires all three table choices.');
                    }
                    $target = $guests[$page];
                    $correct = true;
                    foreach (array_keys($fields) as $field) {
                        if ($selection[$field] !== $target[$field]) $correct = false;
                    }
                    if ($correct) {
                        // A page cannot be solved instantaneously; also guard
                        // against zero-time fabricated action batches.
                        if ($entry['tick'] - $pageStart < 30) {
                            throw $invalid('Unrealistic puzzle timing.');
                        }
                        $visiting = true;
                    } else {
                        $attempt = implode('/', array_values($selection));
                        if (! isset($attempts[$attempt])) {
                            $attempts[$attempt] = true;
                            $misses++;
                        }
                    }
                    break;
                case 'next':
                    if (! $visiting) throw $invalid('Next requires an invited guest.');
                    $page++;
                    if ($page === 3) $finished = true;
                    else {
                        $visiting = false;
                        $selection = ['light' => null, 'food' => null, 'decor' => null];
                        $attempts = []; $pageStart = $entry['tick'];
                    }
                    break;
                default:
                    throw $invalid('Unknown replay action.');
            }
        }
        if (! $finished || $actions[array_key_last($actions)]['kind'] !== 'next'
            || $ticks !== $lastTick + 1) {
            throw $invalid('Replay must end at final guest.');
        }

        // Fixed per-guest scoring with elapsed-time tie breaker; computed
        // entirely by the server from verified actions.
        return ['score' => 3000 + (self::MAX_TICKS - $ticks), 'ticks' => $ticks,
            'passed' => 3];
    }
}
