<?php

namespace App\Infrastructure;

use DateTimeImmutable;
use Domain\Shared\Clock;

final class UtcClock implements Clock
{
    public function now(): DateTimeImmutable
    {
        return \Carbon\CarbonImmutable::now('UTC');
    }
}
