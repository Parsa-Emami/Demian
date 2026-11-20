<?php

namespace Tests\Unit;

use App\Services\Arcade\CampaignEconomics;
use PHPUnit\Framework\TestCase;

final class CampaignEconomicsTest extends TestCase
{
    public function test_integer_minor_units_and_margin_floor(): void
    {
        $service = new CampaignEconomics;
        $e = ['cost_ceiling_bps' => 5000, 'margin_floor_bps' => 2000];
        $this->assertSame(1, CampaignEconomics::ceilBps(1, 1));
        $this->assertSame(0, CampaignEconomics::floorBps(1, 1));
        $this->assertSame(990000000000, CampaignEconomics::floorBps(100000000000000, 99));
        $this->assertTrue($service->marginSafe(10000, 2000, $e));
        $this->assertFalse($service->marginSafe(10000, 4000, $e));
        $this->assertFalse($service->marginSafe(10000, 10000, $e));
    }

    public function test_roi_denominator_and_negative_incrementality(): void
    {
        $this->assertNull(CampaignEconomics::roi(0, 0));
        $this->assertSame(-100.0, CampaignEconomics::roi(-1000, 1000));
        $this->assertSame(50.0, CampaignEconomics::roi(1000, 2000));
        $r = (new CampaignEconomics)->scenario(10000, 2000, [
            'cost_ceiling_bps' => 5000, 'incremental_share_bps' => 0, 'planned_operating_minor' => 1000,
        ]);
        $this->assertSame(-3000, $r['net_incremental_minor']);
        $this->assertSame(60.0, $r['break_even_share_percent']);
    }
}
