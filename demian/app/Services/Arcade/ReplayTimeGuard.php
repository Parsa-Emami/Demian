<?php

namespace App\Services\Arcade;

use DateTimeInterface;

final class ReplayTimeGuard
{
    private const TICK_RATE = 60;
    private const GRACE_MS = 2000;

    public static function assertAllowed(int $ticks, DateTimeInterface $start, DateTimeInterface $end): void
    {
        $elapsedMs = (int) $end->format('Uv') - (int) $start->format('Uv');
        abort_unless($ticks > 0 && $ticks * 1000 <= ($elapsedMs + self::GRACE_MS) * self::TICK_RATE,
            422, 'Replay is ahead of server wall-clock time.');
    }
}
