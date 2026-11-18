<?php

namespace Tests\Unit;

use Domain\Arcade\CohortRetention;
use PHPUnit\Framework\TestCase;

final class CohortRetentionTest extends TestCase
{
    public function test_exact_days_deduplicate_runs_and_exclude_immature_denominators(): void
    {
        $rows = CohortRetention::summarize([
            ['joined' => '2026-11-01', 'active_days' => ['2026-11-02', '2026-11-02', '2026-11-08']],
            ['joined' => '2026-11-01', 'active_days' => ['2026-11-03']],
            ['joined' => '2026-11-16', 'active_days' => ['2026-11-17']],
            ['joined' => '2026-11-17', 'active_days' => []],
        ], '2026-11-17');
        $this->assertCount(2, $rows);
        $this->assertSame(['returned' => 1, 'eligible' => 2, 'percent' => 50.0], $rows[0]['d1']);
        $this->assertSame(50.0, $rows[0]['d7']['percent']);
        $this->assertNull($rows[0]['d30']);
        $this->assertNull($rows[1]['d1']);
        $this->assertSame([], CohortRetention::summarize([], '2026-11-17'));
    }
}
