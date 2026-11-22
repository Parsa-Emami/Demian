<?php

namespace App\Services\Arcade;

use DateTimeImmutable;
use DateTimeInterface;
use Illuminate\Validation\ValidationException;

final class CafeDriftReplayVerifier
{
    public const GAME_ID = 'cafe-drift';
    public const VERSION = 'cafe-drift-replay-v1';
    public const MAX_TICKS = 2700;
    public const MAX_FRAMES = 676;

    private function rules(): array
    {
        static $rules = null;
        return $rules ??= json_decode(file_get_contents(__DIR__.'/../../../resources/game/cafe-drift-rules.json'),
            true, flags: JSON_THROW_ON_ERROR);
    }

    public function seedAt(DateTimeInterface $date): int
    {
        $epoch = new DateTimeImmutable($this->rules()['weekEpoch']);
        return 4096 + (int) floor(($date->getTimestamp() - $epoch->getTimestamp()) / 604800);
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['frames' => [$message]]);
    }

    private function course(int $seed, array $rules): array
    {
        $draw = static function (int $size) use (&$seed): int {
            $seed = ($seed * 48271) % 2147483647;
            return $seed % $size;
        };
        $lanes = $rules['lanes'];
        $choices = array_keys($lanes);
        $gates = [];
        for ($tick = $rules['firstGate']; $tick + $rules['contactTicks'] <= $rules['ticks'];) {
            $index = count($gates);
            $lane = $draw(count($lanes));
            $blocked = [$lane];
            if ($index >= 7 && $index % 3 !== 1) {
                $second = array_values(array_filter($choices, static fn (int $i): bool => abs($i - $lane) >= 2));
                $blocked[] = $second[$draw(count($second))];
            }
            $free = array_values(array_diff($choices, $blocked));
            $bean = $index % 3 === 2 ? $lanes[$free[$draw(count($free))]] : null;
            $obstacles = [];
            foreach ($blocked as $i) {
                $obstacles[] = ['x' => $lanes[$i], 'style' => $draw(3)];
            }
            $gates[] = ['tick' => $tick, 'obstacles' => $obstacles, 'bean' => $bean];
            $tick += max($rules['minimumGap'], $rules['gateGap'] - intdiv($tick, $rules['gapRamp'])) + $draw(13) - 6;
        }
        return $gates;
    }

    private function validateFrames(int $ticks, array $frames, array $rules): array
    {
        $limit = (int) ceil($ticks / $rules['sampleTicks']) + 1;
        if (! array_is_list($frames) || count($frames) < 2 || count($frames) > $limit) {
            $this->fail('Invalid steering replay size.');
        }
        if ($frames[array_key_last($frames)] !== [$ticks, 0]) {
            $this->fail('Missing canonical end marker.');
        }
        $inputs = [];
        $previous = -1;
        $priorTarget = null;
        foreach (array_slice($frames, 0, -1) as $frame) {
            if (! is_array($frame) || ! array_is_list($frame) || count($frame) !== 2
                || ! is_int($frame[0]) || ! is_int($frame[1])) {
                $this->fail('Invalid steering frame.');
            }
            [$tick, $target] = $frame;
            if ($tick <= $previous || $tick >= $ticks || $tick % $rules['sampleTicks'] !== 0
                || ($priorTarget === null && $tick !== 0) || $priorTarget === $target
                || abs($target) > $rules['targetMax']) {
                $this->fail('Noncanonical steering input.');
            }
            $inputs[$tick] = $target;
            $previous = $tick;
            $priorTarget = $target;
        }
        return $inputs;
    }

    public function verify(int $seed, int $ticks, array $frames): array
    {
        $rules = $this->rules();
        if ($ticks < 1 || $ticks > self::MAX_TICKS || $seed < 1 || $seed >= 2147483647) {
            $this->fail('Invalid drift replay duration or seed.');
        }
        $inputs = $this->validateFrames($ticks, $frames, $rules);
        $gates = $this->course($seed, $rules);
        $bound = $rules['targetMax'] * $rules['targetUnit'];
        $x = $velocity = $target = $gateIndex = $score = $passed = $combo = 0;
        $cups = $rules['cups'];
        $clearance = PHP_INT_MAX;
        $collected = false;
        for ($tick = 1; $tick <= $ticks; $tick++) {
            $target = $inputs[$tick - 1] ?? $target;
            $wanted = max(-$rules['maxSpeed'], min($rules['maxSpeed'], $target * $rules['targetUnit'] - $x));
            $velocity += max(-$rules['accel'], min($rules['accel'], $wanted - $velocity));
            $x = max(-$bound, min($bound, $x + $velocity));
            $gate = $gates[$gateIndex] ?? null;
            if ($gate !== null && abs($gate['tick'] - $tick) <= $rules['contactTicks']) {
                foreach ($gate['obstacles'] as $obstacle) {
                    $clearance = min($clearance, abs($x - $obstacle['x']));
                }
                $collected = $collected || ($gate['bean'] !== null && abs($x - $gate['bean']) <= $rules['beanReach']);
                if ($tick === $gate['tick'] + $rules['contactTicks']) {
                    if ($clearance <= $rules['collision']) {
                        $cups--;
                        $combo = 0;
                    } else {
                        $passed++;
                        $score += $rules['passPoints'];
                        $near = $clearance <= $rules['near'];
                        $combo = $near || $collected ? min($rules['comboMax'], $combo + 1) : 0;
                        $score += (($near ? $rules['nearPoints'] : 0) + ($collected ? $rules['beanPoints'] : 0)) * $combo;
                    }
                    $gateIndex++;
                    $clearance = PHP_INT_MAX;
                    $collected = false;
                }
            }
            if ($cups === 0 && $tick !== $ticks) {
                $this->fail('Steering replay continued after the last cup broke.');
            }
        }
        if ($cups > 0 && $ticks !== self::MAX_TICKS) {
            $this->fail('Steering replay stopped before the round ended.');
        }
        if ($ticks === self::MAX_TICKS) {
            $score += $cups * $rules['cupBonus'];
        }
        return ['score' => $score, 'ticks' => $ticks, 'passed' => $passed];
    }
}
