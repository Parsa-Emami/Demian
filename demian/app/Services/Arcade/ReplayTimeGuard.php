<?php

namespace App\Services\Arcade;

use DateTimeInterface;

/** All ranked games simulate at 60 Hz. Client clocks are not evidence. */
final class ReplayTimeGuard
{
    public const TICK_RATE = 60;
    public const GRACE_MS = 2000;

    public static function elapsedMs(DateTimeInterface $start, DateTimeInterface $end): int
    {
        return (int) $end->format('Uv') - (int) $start->format('Uv');
    }

    public static function permits(int $ticks, int $elapsedMs): bool
    {
        // A small symmetric allowance covers database timestamp precision and
        // start/finish networking; it is not extra simulated scoring time.
        return $ticks > 0 && $elapsedMs >= -self::GRACE_MS
            && $ticks * 1000 <= ($elapsedMs + self::GRACE_MS) * self::TICK_RATE;
    }

    public static function assertAllowed(int $ticks, DateTimeInterface $start, DateTimeInterface $end): void
    {
        abort_unless(self::permits($ticks, self::elapsedMs($start, $end)), 422,
            'Replay is ahead of server wall-clock time.');
    }
}
