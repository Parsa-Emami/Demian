<?php

namespace Tests\Unit;

use App\Services\Arcade\PersonalProgressPolicy as P;
use PHPUnit\Framework\TestCase;

final class PersonalProgressPolicyTest extends TestCase
{
    public function test_calibration_and_highwater_do_not_reward_a_low_initial_record(): void
    {
        $this->assertNull(P::evaluate(10, null, 0)['badge']);
        $this->assertNull(P::evaluate(900, 10, 1)['badge']);
        $this->assertNull(P::evaluate(1000, 900, 2)['badge']);
        $this->assertSame(1050, P::goal(1000, 3));
        $this->assertNull(P::evaluate(1, 1000, 4)['badge']);
        $this->assertNull(P::evaluate(1049, 1000, 4)['badge']);
        $this->assertSame('personal-breakthrough', P::evaluate(1050, 1000, 4)['badge']);
        $this->assertNull(P::evaluate(1050, 1050, 5)['badge']);
    }

    public function test_boundaries_late_records_and_zero_budget(): void
    {
        $this->assertSame(25, P::goal(0, 3));
        $this->assertSame(126, P::goal(101, 3));
        $this->assertNull(P::goal(P::MAX_SCORE, 3));
        $this->assertNull(P::evaluate(1500, 1000, 3, true)['badge']);
        $this->assertSame('late', P::evaluate(1500, 1000, 3, true)['status']);
        $this->assertFalse(P::rules()['financial_rewards']);
        $this->assertSame(0,P::rules()['currency_budget_minor']);
    }
}
