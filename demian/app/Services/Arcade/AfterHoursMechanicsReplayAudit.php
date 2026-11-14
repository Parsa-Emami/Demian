<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * Step 09 original After Hours mechanics audit, NOT A RANKED VERIFIER.
 *
 * Reconstructs map/physics evidence, two cards, panel switching, locker/relic,
 * exit and scoring independently of client claims. Deliberately does NOT
 * certify a match: original AfterHoursShadow navigation/perception/capture
 * still needs per-tick deterministic parity before ranked activation.
 * There is NO API route to promote this audit's candidate score.
 */
final class AfterHoursMechanicsReplayAudit
{
    public const MAX_ACTIONS = 6500;
    public const GAME_ID = 'after-hours';
    private const START = ['x'=>-1.2, 'z'=>-6.5];
    private const PANELS = [
        ['kind'=>'panel', 'id'=>'panel-front', 'x'=>2.9, 'z'=>-9.0],
        ['kind'=>'panel', 'id'=>'panel-back', 'x'=>-1.8, 'z'=>-52.1],
    ];
    private const LOCKER = ['kind'=>'locker','id'=>'locker','x'=>-11.6,'z'=>-74.95];
    private const EXIT = ['kind'=>'exit','id'=>'exit','x'=>0.4,'z'=>-3.9];

    public function __construct(private readonly CafeRouteGeometry $geometry,
        private readonly CafeRouteReplayVerifier $routes) {}

    private function reject(string $reason): never
    {
        throw ValidationException::withMessages(['replay' => $reason]);
    }

    public function audit(int $seed, int $ticks, array $actions, string $difficulty = 'standard'): array
    {
        $seconds = match ($difficulty) {
            'standard' => 300, 'hard' => 240,
            default => 0,
        };
        if ($seed < 1 || $seconds === 0 || $ticks < 60 || $ticks > $seconds * 60
            || count($actions) < 10 || count($actions) > self::MAX_ACTIONS) {
            $this->reject('Invalid original After Hours evidence bounds.');
        }
        $goals = $this->routes->goals(self::GAME_ID, $seed);
        $cards = [
            ['kind'=>'card', ...$goals[0], 'collected'=>false],
            ['kind'=>'card', ...$goals[1], 'collected'=>false],
        ];
        $position = self::START;
        $darkCircuit = 'storage';
        $relic = false;
        $lastTick = -1;
        $lastMoveTick = 0;
        $moves = 0;
        $escaped = false;
        $count = 0;
        foreach ($actions as $entry) {
            if (! is_array($entry) || ! is_int($entry['tick'] ?? null)
                || $entry['tick'] <= $lastTick || $entry['tick'] < 0
                || $entry['tick'] >= $ticks || ! is_string($entry['kind'] ?? null)) {
                $this->reject('Original After Hours action clock is non-monotonic.');
            }
            if ($escaped) $this->reject('Evidence after exit is forbidden.');
            $lastTick = $entry['tick'];
            if ($entry['kind'] === 'move') {
                if (! is_numeric($entry['x'] ?? null) || ! is_numeric($entry['z'] ?? null)
                    || is_bool($entry['x']) || is_bool($entry['z'])) {
                    $this->reject('Invalid original player position.');
                }
                $next = ['x'=>(float)$entry['x'], 'z'=>(float)$entry['z']];
                $dt = ($entry['tick'] - $lastMoveTick) / 60;
                if ($dt <= 0 || $dt > 0.5
                    || hypot($next['x']-$position['x'],
                        $next['z']-$position['z']) > 10.8*$dt+0.12
                    || ! $this->geometry->canTraverse($position, $next)) {
                    $this->reject('Impossible movement through original After Hours map.');
                }
                $position = $next;
                $lastMoveTick = $entry['tick'];
                $moves++;
                continue;
            }
            if ($entry['tick'] - $lastMoveTick > 15) {
                $this->reject('No recent movement proof for interaction.');
            }
            $targets = [
                ...self::PANELS, self::EXIT,
                self::LOCKER, ...array_filter($cards,
                    static fn (array $c): bool => ! $c['collected']),
            ];
            $nearest = null;
            $gap = 2.3;
            foreach ($targets as $target) {
                $distance = hypot($position['x']-$target['x'],
                    $position['z']-$target['z']);
                if ($distance < $gap && $this->geometry->canSee($position, $target)) {
                    $gap = $distance;
                    $nearest = $target;
                }
            }
            if ($entry['kind'] === 'power') {
                $newCircuit = $entry['target'] ?? null;
                if (($nearest['kind'] ?? null) !== 'panel'
                    || ! in_array($newCircuit, ['storage','counter','exit'], true)
                    || $newCircuit === $darkCircuit) {
                    $this->reject('Impossible original power circuit change.');
                }
                $darkCircuit = $newCircuit;
            } elseif ($entry['kind'] === 'interact') {
                switch ($nearest['kind'] ?? null) {
                    case 'card':
                        foreach ($cards as &$card) {
                            if ($card['id'] === $nearest['id']) {
                                $card['collected'] = true;
                                $count++;
                                break;
                            }
                        }
                        unset($card);
                        break;
                    case 'locker':
                        if ($darkCircuit !== 'storage') $relic = true;
                        break;
                    case 'exit':
                        if ($count === 2 && $darkCircuit !== 'exit') $escaped = true;
                        break;
                    case 'panel':
                    case null:
                        break;
                }
            } else {
                $this->reject('Unknown original After Hours event.');
            }
        }
        if (! $escaped || $count !== 2 || $moves < 3
            || $lastTick !== $ticks - 1
            || $actions[array_key_last($actions)]['kind'] !== 'interact') {
            $this->reject('No completed original After Hours escape.');
        }
        $remaining = max(0, $seconds - ($ticks / 60));
        return [
            'candidate_score'=>1000+(int)floor($remaining)*2+($relic ? 300 : 0),
            'ticks'=>$ticks, 'cards'=>$count, 'relic'=>$relic,
            'shadow_verified'=>false, 'eligible_for_ranked'=>false,
        ];
    }
}
