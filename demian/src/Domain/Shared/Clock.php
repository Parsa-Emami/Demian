<?php

namespace Domain\Shared;

use DateTimeImmutable;

interface Clock
{
    public function now(): DateTimeImmutable;
}
