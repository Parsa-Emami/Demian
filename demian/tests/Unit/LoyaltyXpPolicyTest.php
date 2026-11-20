<?php

namespace Tests\Unit;

use App\Services\Arcade\LoyaltyXpPolicy as P;
use PHPUnit\Framework\TestCase;

final class LoyaltyXpPolicyTest extends TestCase
{
    public function test_xp_is_bounded_and_independent_of_raw_score_and_run_count(): void
    {
        $this->assertSame(100,P::calculate(1,false,false)['total_xp']);
        $this->assertSame(125,P::calculate(2,false,false)['total_xp']);
        $this->assertSame(225,P::calculate(7,true,true)['total_xp']);
        $this->assertSame(P::calculate(3,true,true),P::calculate(7,true,true));
        $this->assertSame(0,P::rules()['currency_budget_minor']);
        $this->assertFalse(P::rules()['mission_xp_enabled']);
        $this->assertFalse(P::rules()['transferable']);
    }

    public function test_tiers_and_level_boundaries(): void
    {
        $this->assertSame(1,P::level(0)['level']);
        $this->assertSame(249,P::level(249)['level_progress_xp']);
        $this->assertSame(2,P::level(250)['level']);
        foreach(P::TIERS as $name=>$threshold) $this->assertSame($name,P::level($threshold)['tier']);
        $this->assertNull(P::level(6000)['next_tier']);
        $this->assertSame('regular',P::level(499)['next_tier']);
    }

    public function test_no_award_for_empty_game_set(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        P::calculate(0,false,false);
    }
}
