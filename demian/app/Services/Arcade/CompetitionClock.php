<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Competition boundaries are UTC. Weekly high scores reset logically at
 * Monday 00:00 UTC; historical weeks remain queryable in the database.
 * Scoring is attributed to the *run start*, avoiding a last-second replay
 * being moved into a new week's competition at completion time.
 */
final class CompetitionClock
{
    public static function periodKeys(CarbonInterface $date): array
    {
        $utc = CarbonImmutable::instance($date)->utc();

        return ['all', 'daily:'.$utc->format('Y-m-d'), 'weekly:'.$utc->format('o-W')];
    }

    public function snapshot(string $period, ?CarbonInterface $at = null): array
    {
        $now = $at ? CarbonImmutable::instance($at)->utc() : CarbonImmutable::now('UTC');
        $index = ['all' => 0, 'daily' => 1, 'weekly' => 2][$period]
            ?? throw new \InvalidArgumentException('Unsupported competition period.');
        $start = match ($period) {
            'daily' => $now->startOfDay(),
            'weekly' => $now->startOfWeek(CarbonImmutable::MONDAY),
            default => null,
        };
        $end = match ($period) {
            'daily' => $start->addDay(),
            'weekly' => $start->addWeek(),
            default => null,
        };

        return [
            'period' => $period,
            'period_key' => self::periodKeys($now)[$index],
            'timezone' => 'UTC',
            'server_time' => $now->toIso8601String(),
            'starts_at' => $start?->toIso8601String(),
            'next_reset_at' => $end?->toIso8601String(),
            'seconds_remaining' => $end ? max(0, (int) ceil($now->diffInSeconds($end))) : null,
        ];
    }
}
