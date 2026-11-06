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
        $passed = $cursor = $mask = 0; $terminal = false;
        $nextId = 0; $lastAppearance = null;
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
                $edge = $width + 65;
                $x = $nextId === 0 ? min($edge, $r['playerX'] + $speed * $r['firstEncounterSeconds']) : $edge;
                for (;;) {
                    $attack = $random() < $r['attackChance'];
                    if ($attack) {
                        $attacker = $r['attackers'][(int) floor($random() * count($r['attackers']))];
                        $overhead = $random() < $r['overheadChance'];
                        $definition = ['appearance' => $overhead ? 'pounce' : 'charge', 'w' => 40, 'h' => $r['bodyHeight'], 'y' => $overhead ? 44 : 0];
                    } else {
                        $index = (int) floor($random() * count($r['obstacleCatalog']));
                        if ($r['obstacleCatalog'][$index]['appearance'] === $lastAppearance) $index = ($index + 1) % count($r['obstacleCatalog']);
                        $definition = $r['obstacleCatalog'][$index];
                    }
                    $scale = $attack ? 1 : $r['obstacleScaleMinimum'] + $random() * $r['obstacleScaleSpread'];
                    $lastAppearance = $definition['appearance']; $nextId++;
                    $obstacles[] = ['x' => $x, 'y' => $definition['y'], 'w' => (int) round($definition['w'] * $scale),
                        'h' => (int) round($definition['h'] * $scale), 'scored' => false];
                    $p = 1 - exp(-$time / $r['difficultyRampSeconds']);
                    $interval = $r['spawnMinimumSeconds'] - $r['spawnMinimumReduction'] * $p
                        + $random() * ($r['spawnSpreadSeconds'] - $r['spawnSpreadReduction'] * $p);
                    if ($x >= $edge) { $spawnIn = $interval + ($x - $edge) / $speed; break; }
                    $x += $speed * $interval;
                }
            }
            $height = $duck && $y == 0 ? $r['duckHeight'] : $r['bodyHeight'];
            foreach ($obstacles as &$o) {
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
