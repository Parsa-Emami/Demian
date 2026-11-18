<?php

namespace Domain\Arcade;

use DateTimeImmutable;
use InvalidArgumentException;

final class CohortRetention
{
    public static function summarize(array $players, string $today): array
    {
        $end = self::day($today);
        $cohorts = [];
        foreach ($players as $player) {
            $joined = self::day($player['joined']);
            if ($joined >= $end) continue;
            $key = $joined->format('Y-m-d');
            $cohorts[$key] ??= ['joined' => $key, 'players' => 0, 'd1' => null, 'd7' => null, 'd30' => null];
            $cohorts[$key]['players']++;
            foreach ([1, 7, 30] as $day) {
                $target = $joined->modify("+$day days");
                if ($target >= $end) continue;
                $field = 'd'.$day;
                $cohorts[$key][$field] ??= ['returned' => 0, 'eligible' => 0];
                $cohorts[$key][$field]['eligible']++;
                if (in_array($target->format('Y-m-d'), $player['active_days'], true)) $cohorts[$key][$field]['returned']++;
            }
        }
        ksort($cohorts);
        foreach ($cohorts as &$cohort) {
            foreach (['d1', 'd7', 'd30'] as $field) {
                if ($cohort[$field] !== null) $cohort[$field]['percent'] = round(
                    100 * $cohort[$field]['returned'] / $cohort[$field]['eligible'], 2);
            }
        }
        unset($cohort);
        return array_values($cohorts);
    }

    private static function day(string $value): DateTimeImmutable
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (! $date || $date->format('Y-m-d') !== $value) throw new InvalidArgumentException('Invalid cohort date.');
        return $date;
    }
}
