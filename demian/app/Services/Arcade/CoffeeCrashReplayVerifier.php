<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * PHP port of CoffeeCrashModel.js: same 7x8 board, xorshift32 RNG,
 * rows/columns matches, specials, cascade, shuffle, undo and level-one goals.
 * Clients only transmit swap indices + ticks; score is never trusted.
 *
 * A JavaScript/PHP differential fixture is generated from the real JS model
 * and checked by CI. Rules are versioned to prevent quiet scoring drift.
 */
final class CoffeeCrashReplayVerifier
{
    public const GAME_ID = 'coffee-crash';
    public const VERSION = 'coffee-crash-replay-v1';
    public const COLS = 7;
    public const ROWS = 8;
    public const COUNT = 56;
    public const MAX_TICKS = 18000;
    public const MAX_ACTIONS = 40;

    private int $rng;
    private int $score = 0;
    private int $moves = 24;
    private int $bestChain = 0;
    private bool $usedUndo = false;
    private string $status = 'playing';
    private array $collected = [0, 0, 0, 0, 0];
    private array $board = [];
    private ?array $history = null;

    private function invalid(string $message): never
    {
        throw ValidationException::withMessages(['replay' => $message]);
    }

    private function reset(int $seed): void
    {
        $this->rng = $seed & 0xffffffff;
        $this->score = 0; $this->moves = 24; $this->bestChain = 0;
        $this->status = 'playing'; $this->usedUndo = false;
        $this->collected = [0, 0, 0, 0, 0];
        $this->history = null;
        $this->generate();
    }

    private function random(int $max): int
    {
        $state = $this->rng;
        $state ^= ($state << 13) & 0xffffffff;
        $state &= 0xffffffff;
        $state ^= $state >> 17;
        $state &= 0xffffffff;
        $state ^= ($state << 5) & 0xffffffff;
        $this->rng = $state & 0xffffffff;
        return (int) floor($this->rng / 4294967296 * $max);
    }

    private function tile(): array
    {
        return ['type' => $this->random(5), 'special' => null];
    }

    private function adjacent(int $a, int $b): bool
    {
        return $a >= 0 && $b >= 0 && $a < self::COUNT && $b < self::COUNT
            && abs($a % self::COLS - $b % self::COLS)
                + abs(intdiv($a, self::COLS) - intdiv($b, self::COLS)) === 1;
    }

    private function swapTiles(int $a, int $b): void
    {
        [$this->board[$a], $this->board[$b]] = [$this->board[$b], $this->board[$a]];
    }

    private function runs(): array
    {
        $runs = [];
        foreach (['row', 'column'] as $direction) {
            $lines = $direction === 'row' ? self::ROWS : self::COLS;
            $length = $direction === 'row' ? self::COLS : self::ROWS;
            for ($line = 0; $line < $lines; $line++) {
                $group = [];
                for ($offset = 0; $offset <= $length; $offset++) {
                    $i = $direction === 'row'
                        ? $line * self::COLS + $offset
                        : $offset * self::COLS + $line;
                    $tile = $offset < $length ? ($this->board[$i] ?? null) : null;
                    if ($tile === null || ($group
                        && $tile['type'] !== $this->board[$group[0]]['type'])) {
                        if (count($group) >= 3) {
                            $runs[] = ['cells' => $group, 'direction' => $direction];
                        }
                        $group = [];
                    }
                    if ($tile !== null) $group[] = $i;
                }
            }
        }
        return $runs;
    }

    private function specialSwap(int $a, int $b): bool
    {
        return ($this->board[$a]['special'] ?? null) === 'rainbow'
            || ($this->board[$b]['special'] ?? null) === 'rainbow'
            || (($this->board[$a]['special'] ?? null) !== null
                && ($this->board[$b]['special'] ?? null) !== null);
    }

    private function findMove(): ?array
    {
        for ($a = 0; $a < self::COUNT; $a++) {
            foreach ([$a + 1, $a + self::COLS] as $b) {
                if (! $this->adjacent($a, $b)) continue;
                if ($this->specialSwap($a, $b)) return [$a, $b];
                $this->swapTiles($a, $b);
                $valid = false;
                foreach ($this->runs() as $run) {
                    if (in_array($a, $run['cells'], true)
                        || in_array($b, $run['cells'], true)) $valid = true;
                }
                $this->swapTiles($a, $b);
                if ($valid) return [$a, $b];
            }
        }
        return null;
    }

    private function generate(): void
    {
        for ($attempt = 0; $attempt < 300; $attempt++) {
            $this->board = [];
            for ($i = 0; $i < self::COUNT; $i++) {
                $allowed = [];
                for ($type = 0; $type < 5; $type++) {
                    if ($i % self::COLS >= 2
                        && $this->board[$i-1]['type'] === $type
                        && $this->board[$i-2]['type'] === $type) continue;
                    if ($i >= self::COLS * 2
                        && $this->board[$i-self::COLS]['type'] === $type
                        && $this->board[$i-self::COLS * 2]['type'] === $type) continue;
                    $allowed[] = $type;
                }
                $this->board[] = [
                    'type' => $allowed[$this->random(count($allowed))],
                    'special' => null
                ];
            }
            if ($this->findMove() !== null) return;
        }
        throw new \RuntimeException('Unable to generate Coffee Crash board.');
    }

    private function creations(array $runs, array $preferred): array
    {
        $groups = [];
        foreach ($runs as $run) {
            $touching = [];
            foreach ($groups as $i => $group) {
                if (array_intersect($run['cells'], array_keys($group['cells']))) {
                    $touching[] = $i;
                }
            }
            $group = ['cells' => array_fill_keys($run['cells'], true), 'runs' => [$run]];
            // Match JS groups.filter + splice semantics.
            foreach (array_reverse($touching) as $i) {
                foreach ($groups[$i]['cells'] as $j => $unused) $group['cells'][$j] = true;
                array_push($group['runs'], ...$groups[$i]['runs']);
                array_splice($groups, $i, 1);
            }
            $groups[] = $group;
        }
        $creations = [];
        foreach ($groups as $group) {
            $longest = $group['runs'][0];
            foreach ($group['runs'] as $r) {
                if (count($r['cells']) > count($longest['cells'])) $longest = $r;
            }
            $special = count($longest['cells']) >= 5 ? 'rainbow'
                : (count($group['runs']) > 1 ? 'bomb'
                    : (count($longest['cells']) === 4 ? $longest['direction'] : null));
            if ($special === null) continue;
            $candidates = array_merge($preferred, array_keys($group['cells']));
            foreach ($candidates as $index) {
                if (isset($group['cells'][$index])
                    && ($this->board[$index]['special'] ?? null) === null) {
                    $creations[] = ['index' => $index, 'special' => $special];
                    break;
                }
            }
        }
        return $creations;
    }

    private function expand(array &$clear, array $rainbowTargets): void
    {
        $queue = array_keys($clear);
        $seen = [];
        $add = function (int $i) use (&$clear, &$queue): void {
            if ($i >= 0 && $i < self::COUNT && $this->board[$i] !== null
                && ! isset($clear[$i])) {
                $clear[$i] = true;
                $queue[] = $i;
            }
        };
        for ($head = 0; $head < count($queue); $head++) {
            $i = $queue[$head];
            if (isset($seen[$i])) continue;
            $seen[$i] = true;
            $special = $this->board[$i]['special'] ?? null;
            if ($special === null) continue;
            $x = $i % self::COLS;
            $y = intdiv($i, self::COLS);
            if ($special === 'row') {
                for ($xx=0; $xx<self::COLS; $xx++) $add($y*self::COLS+$xx);
            } elseif ($special === 'column') {
                for ($yy=0; $yy<self::ROWS; $yy++) $add($yy*self::COLS+$x);
            } elseif ($special === 'bomb') {
                for ($yy=max(0,$y-1); $yy<=min(self::ROWS-1,$y+1); $yy++) {
                    for ($xx=max(0,$x-1); $xx<=min(self::COLS-1,$x+1); $xx++) {
                        $add($yy*self::COLS+$xx);
                    }
                }
            } elseif ($special === 'rainbow') {
                $target = $rainbowTargets[$i] ?? $this->board[$i]['type'];
                foreach ($this->board as $at => $tile) {
                    if ($tile !== null && $tile['type'] === $target) $add($at);
                }
            }
        }
    }

    private function collapse(): void
    {
        for ($x=0; $x<self::COLS; $x++) {
            $remaining = [];
            for ($y=self::ROWS-1; $y>=0; $y--) {
                if ($this->board[$y*self::COLS+$x] !== null) {
                    $remaining[] = $this->board[$y*self::COLS+$x];
                }
            }
            for ($y=self::ROWS-1; $y>=0; $y--) {
                $this->board[$y*self::COLS+$x] =
                    array_shift($remaining) ?? $this->tile();
            }
        }
    }

    private function shuffle(): void
    {
        $original = $this->board;
        for ($attempt=0; $attempt<300; $attempt++) {
            $this->board = $original;
            for ($i=self::COUNT-1; $i>0; $i--) {
                $j = $this->random($i+1);
                $this->swapTiles($i,$j);
            }
            if (! $this->runs() && $this->findMove() !== null) return;
        }
        $this->generate();
    }

    private function snapshot(): array
    {
        return [
            'board' => $this->board, 'rng' => $this->rng,
            'score' => $this->score, 'moves' => $this->moves,
            'collected' => $this->collected,
            'status' => $this->status, 'bestChain' => $this->bestChain,
        ];
    }

    private function swap(int $a, int $b): bool
    {
        if ($this->status !== 'playing' || ! $this->adjacent($a,$b)) return false;
        $before = $this->snapshot();
        $special = $this->specialSwap($a,$b);
        $this->swapTiles($a,$b);
        $runs = $this->runs();
        if (! $special) {
            $found = false;
            foreach ($runs as $r) {
                if (in_array($a,$r['cells'],true) || in_array($b,$r['cells'],true)) {
                    $found = true;
                    break;
                }
            }
            if (! $found) {
                $this->board = $before['board'];
                return false;
            }
        }
        $this->history = $before;
        $this->moves--;
        $initial = $special ? [$a => true, $b => true] : null;
        $targets = [];
        if ($special) {
            $rainbows = [];
            foreach ([$a,$b] as $i) {
                if ($this->board[$i]['special'] === 'rainbow') $rainbows[] = $i;
            }
            if ($rainbows) {
                $target = $this->board[$rainbows[0] === $a ? $b : $a]['type'];
                foreach ($rainbows as $i) $targets[$i] = $target;
                foreach ($this->board as $i=>$tile) {
                    if (count($rainbows) === 2 || $tile['type'] === $target) {
                        $initial[$i] = true;
                    }
                }
            }
        }

        $chain = 0;
        while (($runs || $initial !== null) && $chain < 64) {
            $chain++;
            $creations = $initial !== null ? []
                : $this->creations($runs, $chain === 1 ? [$b,$a] : []);
            $clear = $initial ?? [];
            if ($initial === null) {
                foreach ($runs as $run) {
                    foreach ($run['cells'] as $i) $clear[$i] = true;
                }
            }
            $this->expand($clear, $chain === 1 ? $targets : []);
            foreach ($creations as $creation) unset($clear[$creation['index']]);
            foreach ($clear as $i => $unused) {
                $type = $this->board[$i]['type'];
                $this->collected[$type]++;
                $this->score += 60 * min($chain,5);
                $this->board[$i] = null;
            }
            foreach ($creations as $creation) {
                $this->board[$creation['index']]['special'] = $creation['special'];
            }
            $this->collapse();
            $initial = null;
            $runs = $this->runs();
        }
        $this->bestChain = max($this->bestChain,$chain);
        if ($runs) $this->generate();
        elseif ($this->findMove() === null) $this->shuffle();

        $this->status = $this->collected[0] >= 12 ? 'won'
            : ($this->moves <= 0 ? 'lost' : 'playing');
        return true;
    }

    private function undo(): bool
    {
        if ($this->history === null || $this->usedUndo || $this->status !== 'playing') {
            return false;
        }
        $this->board = $this->history['board'];
        $this->rng = $this->history['rng'];
        $this->score = $this->history['score'];
        $this->moves = $this->history['moves'];
        $this->collected = $this->history['collected'];
        $this->status = $this->history['status'];
        $this->bestChain = $this->history['bestChain'];
        $this->history = null;
        $this->usedUndo = true;
        return true;
    }

    public function verify(int $seed, int $ticks, array $actions): array
    {
        if ($ticks < 1 || $ticks > self::MAX_TICKS || count($actions) < 1
            || count($actions) > self::MAX_ACTIONS) {
            $this->invalid('Replay length exceeds game limits.');
        }
        $this->reset($seed);
        $lastTick = -1;
        foreach ($actions as $entry) {
            if (! is_array($entry) || ! is_int($entry['tick'] ?? null)
                || ! is_string($entry['kind'] ?? null)
                || $entry['tick'] <= $lastTick || $entry['tick'] >= $ticks) {
                $this->invalid('Invalid Coffee Crash event order.');
            }
            $lastTick = $entry['tick'];
            if ($entry['kind'] === 'swap') {
                if (! is_int($entry['a'] ?? null) || ! is_int($entry['b'] ?? null)
                    || ! $this->adjacent($entry['a'], $entry['b'])
                    || ! $this->swap($entry['a'], $entry['b'])) {
                    $this->invalid('Illegal or unmatched tile swap.');
                }
            } elseif ($entry['kind'] === 'undo') {
                if (! $this->undo()) $this->invalid('Illegal undo operation.');
            } else {
                $this->invalid('Unknown Coffee Crash event.');
            }
            if ($this->status !== 'playing' && $entry !== $actions[array_key_last($actions)]) {
                $this->invalid('Events after terminal Coffee Crash state.');
            }
        }
        if ($this->status === 'playing' || $ticks !== $lastTick+1) {
            $this->invalid('Replay does not terminate at game end.');
        }
        return ['score' => $this->score, 'ticks' => $ticks,
            'passed' => array_sum($this->collected)];
    }
}
