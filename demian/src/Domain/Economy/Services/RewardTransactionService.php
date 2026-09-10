<?php
namespace Domain\Economy\Services;
use Illuminate\Support\Facades\DB;
class RewardTransactionService { public function execute(callable $callback){ return DB::transaction($callback); } }
