<?php

namespace Domain\Economy\Services;

use Domain\Shared\Clock;

class RewardHistoryService
{
    public function __construct(private readonly Clock $clock) {}

    public function record(array $data): array
    {
        return $data + ['created_at' => $this->clock->now()];
    }
}
