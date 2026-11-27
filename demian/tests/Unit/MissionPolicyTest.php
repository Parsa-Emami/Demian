<?php

namespace Tests\Unit;

use App\Services\Arcade\MissionPolicy as P;
use PHPUnit\Framework\TestCase;

final class MissionPolicyTest extends TestCase
{
    public function test_daily_and_weekly_limits(): void
    {
        $this->assertSame(0, P::evaluate(0, 0, false)['total_xp']);
        $this->assertSame(5, P::evaluate(1, 1, false)['total_xp']);
        $this->assertSame(30, P::evaluate(7, 1, false)['total_xp']);
        $this->assertSame(75, P::evaluate(127, 7, true)['total_xp']);
        $this->assertSame(P::evaluate(127, 2, true)['total_xp'], P::evaluate(127, 7, true)['total_xp']);
        $this->assertFalse(P::rules()['financial_rewards']);
    }

    public function test_invalid_mask_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        P::evaluate(128,1,false);
    }
}
