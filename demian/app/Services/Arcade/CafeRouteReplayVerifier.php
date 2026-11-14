<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * Conservative, independent location/time/interaction verifier for new
 * *finite route-trial modes*. This never certifies casual After Hours shadow
 * AI, Cafe Rush tray physics or unrestricted Open World exploration scores.
 *
 * Score is only for the explicitly labeled challenge mode, from bounded
 * server-checked movement evidence and prescribed checkpoints.
 */
final class CafeRouteReplayVerifier
{
    public const VERSIONS = [
        'after-hours' => 'after-hours-route-v1',
        'cafe-rush' => 'cafe-rush-route-v1',
        'open-world' => 'open-world-route-v2',
    ];
    public const MAX_ACTIONS = 6500;

    public function __construct(private readonly CafeRouteGeometry $geometry) {}

    public function seconds(string $game): int
    {
        return match ($game) {
            'after-hours' => 300, 'cafe-rush' => 120,
            'open-world' => 240,
            default => throw new \InvalidArgumentException('Unknown trial'),
        };
    }

    public function origin(string $game): array
    {
        return match ($game) {
            'after-hours' => ['x' => -1.2, 'z' => -6.5],
            'cafe-rush' => ['x' => -0.35, 'z' => -25.3],
            'open-world' => ['x' => 0.36, 'z' => -4.68],
            default => throw new \InvalidArgumentException('Unknown trial'),
        };
    }

    public function goals(string $game, int $seed): array
    {
        return match ($game) {
            'after-hours' => $this->afterHoursGoals($seed),
            'cafe-rush' => $this->cafeRushGoals($seed),
            'open-world' => [
                ['id' => 'save-counter', 'x' => 3.24, 'z' => -30.6],
                ['id' => 'save-lounge', 'x' => 0.36, 'z' => -68.76],
                ['id' => 'save-arcade', 'x' => 3.96, 'z' => -88.92],
            ],
            default => throw new \InvalidArgumentException('Unknown trial'),
        };
    }

    private function afterHoursGoals(int $seed): array
    {
        $layouts = [
            [['x'=>1.1,'z'=>-24.8], ['x'=>3.7,'z'=>-68.5]],
            [['x'=>-10.9,'z'=>-34.6], ['x'=>-11.8,'z'=>-65.5]],
            [['x'=>7.0,'z'=>-48.8], ['x'=>-6.4,'z'=>-72.7]],
        ];
        $cards = $layouts[$seed % count($layouts)];
        return [
            ['id'=>'card-1', ...$cards[0]],
            ['id'=>'card-2', ...$cards[1]],
            ['id'=>'exit', 'x'=>0.4, 'z'=>-3.9],
        ];
    }

    private function cafeRushGoals(int $seed): array
    {
        $variation = $seed % 3;
        $menus = ['tea', 'cake', 'espresso', 'tea', 'espresso', 'cake'];
        $tables = [1,2,1,2,1,2,2,1];
        $spots = [
            'tickets' => ['x'=>-0.1,'z'=>-26.35],
            'bar' => ['x'=>2.95,'z'=>-31.15],
            'pastry' => ['x'=>2.6,'z'=>-22.25],
            'table-1' => ['x'=>-2.35,'z'=>-16.9],
            'table-2' => ['x'=>-2.9,'z'=>-43.4],
        ];
        $goals = [];
        for ($i = 0; $i < 2; $i++) {
            $recipe = $menus[($i + $variation) % count($menus)];
            $station = $recipe === 'cake' ? 'pastry' : 'bar';
            $table = 'table-'.$tables[($i+$variation) % count($tables)];
            foreach (['tickets', $station, $table] as $j=>$spot) {
                $goals[] = ['id'=>('order'.($i+1).'-'.$j.'-'.$spot),
                    ...$spots[$spot]];
            }
        }
        return $goals;
    }

    private function invalid(string $text): never
    {
        throw ValidationException::withMessages(['replay' => $text]);
    }

    public function verify(string $game, int $seed, int $ticks, array $actions): array
    {
        if (! isset(self::VERSIONS[$game])) $this->invalid('Unknown route rules.');
        if ($ticks < 60 || $ticks > $this->seconds($game)*60
            || count($actions) < 5 || count($actions) > self::MAX_ACTIONS) {
            $this->invalid('Route evidence length is invalid.');
        }
        $goals = $this->goals($game, $seed);
        $goalIndex = 0;
        $origin = $this->origin($game);
        $position = $origin;
        $lastTick = -1;
        $lastMoveTick = 0;
        $goalTick = 0;
        $seen = 0;
        foreach ($actions as $entry) {
            if (! is_array($entry) || ! is_int($entry['tick'] ?? null)
                || ! is_string($entry['kind'] ?? null)
                || $entry['tick'] <= $lastTick || $entry['tick'] >= $ticks
                || $entry['tick'] < 0) {
                $this->invalid('Unordered or out-of-bounds route events.');
            }
            if ($goalIndex === count($goals)) $this->invalid('Events after route completion.');
            $lastTick = $entry['tick'];
            if ($entry['kind'] === 'move') {
                if (! is_numeric($entry['x'] ?? null)
                    || ! is_numeric($entry['z'] ?? null)) $this->invalid('Missing move position.');
                $next = ['x' => (float) $entry['x'], 'z' => (float) $entry['z']];
                $delta = $entry['tick'] - $lastMoveTick;
                if ($delta < 1 || $delta > 30) {
                    $this->invalid('Location evidence gaps are too large.');
                }
                $distance = hypot($next['x'] - $position['x'],
                    $next['z'] - $position['z']);
                // Input speed cap is intentionally conservative: game sprint
                // caps are <=11.6. Network/float tolerances do not permit
                // teleporting through walls or faster-than-possible paths.
                if ($distance > (11.7 * $delta / 60) + 0.12
                    || ! $this->geometry->canTraverse($position, $next)) {
                    $this->invalid('Route crosses an obstacle or exceeds speed.');
                }
                $position = $next;
                $lastMoveTick = $entry['tick'];
                $seen++;
            } elseif ($entry['kind'] === 'checkpoint') {
                if (! is_string($entry['target'] ?? null)
                    || $entry['target'] !== $goals[$goalIndex]['id']
                    || $entry['tick'] - $goalTick < 20
                    || $entry['tick'] - $lastMoveTick > 15) {
                    $this->invalid('Unexpected or premature checkpoint.');
                }
                $goal = $goals[$goalIndex];
                if (hypot($position['x'] - $goal['x'],
                    $position['z'] - $goal['z']) >= 2.25
                    || ($game === 'open-world'
                        && ! $this->geometry->canSee($position, $goal))) {
                    $this->invalid('Cannot claim an out-of-reach or occluded checkpoint.');
                }
                $goalTick = $entry['tick'];
                $goalIndex++;
            } else {
                $this->invalid('Unknown route evidence action.');
            }
        }
        if ($seen < 3 || $goalIndex !== count($goals)
            || $actions[array_key_last($actions)]['kind'] !== 'checkpoint'
            || $ticks !== $lastTick + 1) {
            $this->invalid('Route has not reached a valid terminal checkpoint.');
        }

        $score = (int) (count($goals)*1000
            + $this->seconds($game)*60 - $ticks);
        return ['score'=>$score, 'ticks'=>$ticks, 'passed'=>count($goals)];
    }
}
