<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Weekly seasons reset Saturday 00:00 Asia/Tehran (Friday 20:30 UTC at
 * the current statutory UTC+03:30 offset); daily periods remain UTC.
 * A run belongs to its starting season, never its completion season.
 * Historical period keys stay stored without destructive reset jobs.
 */
final class CompetitionClock
{
    public static function periodKeys(CarbonInterface $date): array
    {
        $utc = CarbonImmutable::instance($date)->utc();

        $seasonStart = $utc->setTimezone('Asia/Tehran')->startOfWeek(CarbonImmutable::SATURDAY);
        return ['all', 'daily:'.$utc->format('Y-m-d'), 'weekly:tehran:'.$seasonStart->format('Y-m-d')];
    }

    public function snapshot(string $period, ?CarbonInterface $at = null): array
    {
        $now = $at ? CarbonImmutable::instance($at)->utc() : CarbonImmutable::now('UTC');
        $index = ['all' => 0, 'daily' => 1, 'weekly' => 2][$period]
            ?? throw new \InvalidArgumentException('Unsupported competition period.');
        $seasonStart = $period === 'weekly'
            ? $now->setTimezone('Asia/Tehran')->startOfWeek(CarbonImmutable::SATURDAY)
            : null;
        $start = match ($period) {
            'daily' => $now->startOfDay(),
            'weekly' => $seasonStart->utc(),
            default => null,
        };
        $end = match ($period) {
            'daily' => $start->addDay(),
            'weekly' => $seasonStart->addWeek()->utc(),
            default => null,
        };

        return [
            'period' => $period,
            'period_key' => self::periodKeys($now)[$index],
            'timezone' => $period === 'weekly' ? 'Asia/Tehran' : 'UTC',
            'server_time' => $now->toIso8601String(),
            'starts_at' => $start?->toIso8601String(),
            'next_reset_at' => $end?->toIso8601String(),
            'seconds_remaining' => $end ? max(0, (int) ceil($now->diffInSeconds($end))) : null,
        ];
    }
}
