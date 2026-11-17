<?php

namespace Domain\Economy\Services;

use Domain\Shared\TransactionRunner;

class RewardTransactionService
{
    public function __construct(private readonly TransactionRunner $transactions) {}

    public function execute(callable $callback): mixed
    {
        return $this->transactions->execute($callback);
    }
}
