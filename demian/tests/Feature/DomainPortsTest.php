<?php

namespace Tests\Feature;

use Domain\Economy\Services\RewardHistoryService;
use Domain\Economy\Services\RewardTransactionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class DomainPortsTest extends TestCase
{
    use RefreshDatabase;

    public function test_framework_adapters_resolve_without_domain_coupling(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 17)->setTime(12, 0));
        $record = app(RewardHistoryService::class)->record(['kind' => 'probe']);
        $this->assertSame(now()->timestamp, $record['created_at']->getTimestamp());
        $level = DB::transactionLevel();
        $result = app(RewardTransactionService::class)->execute(function () use ($level): int {
            $this->assertSame($level + 1, DB::transactionLevel());
            return 42;
        });
        $this->assertSame(42, $result);
        $this->assertSame($level, DB::transactionLevel());
    }
}
