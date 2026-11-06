<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

final class RunnerReplayVerifier
{
    public function rules(): array
    {
        return json_decode(file_get_contents(config('demian-arcade.rules_path')), true, flags: JSON_THROW_ON_ERROR);
    }

    public function verify(int $seed, int $width, int $ticks, array $transitions): array
    {
        $r = $this->rules();
        $invalid = fn (string $message) => ValidationException::withMessages(['replay' => $message]);
        if ($ticks < 1 || $ticks > $r['maxTicks'] || count($transitions) > $r['maxTransitions'] || ! $transitions) throw $invalid('Replay limits exceeded.');
        $previousTick = $previousMask = -1;
        foreach ($transitions as $entry) {
            if (! isset($entry['tick'], $entry['mask']) || ! is_int($entry['tick']) || ! is_int($entry['mask'])
                || $entry['tick'] <= $previousTick || $entry['tick'] >= $ticks || $entry['mask'] < 0
                || $entry['mask'] > 7 || $entry['mask'] === $previousMask) throw $invalid('Invalid input transitions.');
            $previousTick = $entry['tick']; $previousMask = $entry['mask'];
        }
        if ($transitions[0]['tick'] !== 0 || ! ($transitions[0]['mask'] & 1)) throw $invalid('Replay must start with a jump at tick zero.');
        $randomState = $seed & 0xffffffff;
        $random = static function () use (&$randomState): float {
            $randomState = ($randomState * 1664525 + 1013904223) & 0xffffffff;

            return $randomState / 4294967296;
        };
        $dt = 1 / $r['tickRate'];
        $y = $vy = $time = $distance = $buffer = 0.0;
        $spawnIn = $r['firstSpawnSeconds']; $obstacles = [];
        $passed = $cursor = $mask = $nextId = 0; $terminal = false;
        for ($tick = 0; $tick < $ticks; $tick++) {
            if (isset($transitions[$cursor]) && $transitions[$cursor]['tick'] === $tick) $mask = $transitions[$cursor++]['mask'];
            $jump = (bool) ($mask & 1); $held = (bool) ($mask & 2); $duckInput = (bool) ($mask & 4);
            $buffer = $jump ? $r['jumpBufferSeconds'] : max(0, $buffer - $dt);
            $duck = $duckInput && $y == 0;
            if ($buffer > 0 && $y == 0 && ! $duck) { $vy = $r['jumpSpeed']; $buffer = 0; }
            if ($y > 0 || $vy > 0) {
                $ratio = $vy / $r['jumpSpeed']; $gravity = $r['gravity'];
                if ($ratio > 0 && ! $held) $gravity *= $r['releasedRiseGravity'];
                elseif ($held && abs($ratio) < $r['apexRatio']) {
                    $t = abs($ratio) / $r['apexRatio']; $edge = $t * $t * (3 - 2 * $t);
                    $gravity *= $r['heldApexGravity'] + (1 - $r['heldApexGravity']) * $edge;
                }
                $vy -= $gravity * $dt; $y += $vy * $dt;
                if ($y <= 0) {
                    $y = $vy = 0.0; $duck = $duckInput;
                    if ($buffer > 0 && ! $duck) { $vy = $r['jumpSpeed']; $buffer = 0; }
                }
            }
            $time += $dt; $speed = min($r['maxSpeed'], $r['startSpeed'] + $time * $r['speedRamp']);
            $distance += $speed * $dt; $spawnIn -= $dt;
            if ($spawnIn <= 0) {
                $id = $nextId++;
                $attack = $id % $r['attackEvery'] === $r['attackEvery'] - 1;
                $definition = $attack ? $r['attacks'][intdiv($id, $r['attackEvery']) % count($r['attacks'])]
                    : $r['hazards'][min(count($r['hazards']) - 1, (int) floor($random() * count($r['hazards'])))];
                $x = $attack ? $width - $r['attackOriginInset'] : $width + 65;
                $warning = $attack ? $r['attackWarningSeconds'] : 0;
                $obstacles[] = [...$definition, 'x' => $x, 'warningLeft' => $warning, 'scored' => false];
                $p = 1 - exp(-$time / $r['difficultyRampSeconds']);
                $spawnIn = $warning + $r['spawnMinimumSeconds'] - $r['spawnMinimumReduction'] * $p
                    + $random() * ($r['spawnSpreadSeconds'] - $r['spawnSpreadReduction'] * $p);
            }

            $height = $duck && $y == 0 ? $r['duckHeight'] : $r['bodyHeight'];
            foreach ($obstacles as &$o) {
                if ($o['warningLeft'] > 0) { $o['warningLeft'] = max(0, $o['warningLeft'] - $dt); continue; }
                $o['x'] -= $speed * $dt; $x = $o['x'] + 3; $oy = $o['y'] + 2;
                $w = $o['w'] - 6 + $speed * $dt; $h = $o['h'] - 4;
                if ($r['playerX'] - 14 < $x + $w && $r['playerX'] - 14 + $r['bodyWidth'] > $x
                    && $y + 3 < $oy + $h && $y + 3 + $height - 4 > $oy) { $terminal = true; break; }
                if (! $o['scored'] && $o['x'] + $o['w'] < $r['playerX'] - 14) { $o['scored'] = true; $passed++; }
            }
            unset($o);
            $obstacles = array_values(array_filter($obstacles, fn (array $o): bool => $o['x'] + $o['w'] > -50));
            if ($tick + 1 >= $r['maxTicks']) $terminal = true;
            if ($terminal && $tick + 1 !== $ticks) throw $invalid('Replay continues after game over.');
        }
        if (! $terminal) throw $invalid('Replay ends before game over.');

        return ['score' => (int) floor($distance / 10), 'ticks' => $ticks, 'passed' => $passed];
    }
}
