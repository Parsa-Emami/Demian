<?php

namespace App\Infrastructure;

use Domain\Shared\TransactionRunner;
use Illuminate\Support\Facades\DB;

final class DatabaseTransaction implements TransactionRunner
{
    public function execute(callable $operation): mixed
    {
        return DB::transaction($operation);
    }
}
