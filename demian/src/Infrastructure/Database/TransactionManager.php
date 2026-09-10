<?php
namespace App\Infrastructure\Database;
use Illuminate\Support\Facades\DB;
class TransactionManager {
    public function run(callable $callback): mixed {
        return DB::transaction($callback);
    }
}
