<?php

namespace Tests\Unit;

use App\Services\Arcade\DynamicWinnerAllocation;
use PHPUnit\Framework\TestCase;

final class DynamicWinnerAllocationTest extends TestCase
{
    private function rows(int $n, string $prefix = 'p'): array
    {
        $rows = [];
        for ($i = 1; $i <= $n; $i++) $rows[] = [
            'player_id' => $prefix.$i, 'score' => $n - $i, 'verified' => true,
            'achieved_at' => '2026-11-10T10:00:00Z',
        ];
        return $rows;
    }

    public function test_minimum_target_and_existing_tier_cap(): void
    {
        $s = new DynamicWinnerAllocation;
        foreach ([0 => 0, 19 => 0, 20 => 3, 50 => 7, 67 => 10, 1000 => 10] as $n => $expected) {
            $r = $s->allocate(['dino-run' => $this->rows($n)], [], [], 200, $s::policy());
            $this->assertSame($expected, $r['summary']['winner_count']);
        }
    }

    public function test_budget_fairness_distinct_players_and_determinism(): void
    {
        $s = new DynamicWinnerAllocation;
        $a = $this->rows(50);
        $b = [...$a, ...$this->rows(20, 'other')];
        $r = $s->allocate(['dino-run' => $a, 'cafe-drift' => $b], ['p1', 'p2'], ['p3'], 5, $s::policy());
        $this->assertSame(5, $r['summary']['winner_count']);
        $this->assertGreaterThan(0, $r['summary']['games']['dino-run']['winners']);
        $this->assertGreaterThan(0, $r['summary']['games']['cafe-drift']['winners']);
        $ids = array_column(array_merge(...array_values($r['winners'])), 'player_id');
        $this->assertCount(5, array_unique($ids));
        foreach (['p1','p2','p3'] as $id) $this->assertNotContains($id, $ids);
        $this->assertSame($r, $s->allocate(['cafe-drift' => array_reverse($b), 'dino-run' => array_reverse($a)],
            ['p1','p2'], ['p3'], 5, $s::policy()));
    }

    public function test_repeated_attempts_cannot_inflate_participation(): void
    {
        $s = new DynamicWinnerAllocation;
        $r = $s->allocate(['dino-run' => array_merge(...array_fill(0, 100, $this->rows(1)))], [], [], 10, $s::policy());
        $this->assertSame(1, $r['summary']['participants']);
        $this->assertSame(0, $r['summary']['winner_count']);
    }

    public function test_unfunded_and_excluded_players_cannot_receive_prizes(): void
    {
        $s = new DynamicWinnerAllocation;
        $rows = $this->rows(50);
        $this->assertSame(0, $s->allocate(['dino-run' => $rows], [], [], 0, $s::policy())['summary']['winner_count']);
        $this->assertSame(0, $s->allocate(['dino-run' => $rows], [], array_column($rows, 'player_id'), 10, $s::policy())['summary']['winner_count']);
    }
}
