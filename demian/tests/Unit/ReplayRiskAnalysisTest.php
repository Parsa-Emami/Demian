<?php

namespace Tests\Unit;

use App\Services\Arcade\ReplayRiskAnalysis;
use App\Services\Arcade\ReplayTimeGuard;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class ReplayRiskAnalysisTest extends TestCase
{
    public function test_server_time_is_signed_and_bounded(): void
    {
        $start = new DateTimeImmutable('2026-11-20T10:00:00.000Z');
        $future = $start->modify('-30 seconds');
        $this->assertSame(-30000, ReplayTimeGuard::elapsedMs($start,$future));
        $this->assertFalse(ReplayTimeGuard::permits(1,-30000));
        $this->assertTrue(ReplayTimeGuard::permits(600,8000));
        $this->assertFalse(ReplayTimeGuard::permits(601,8000));
        $this->assertTrue(ReplayTimeGuard::permits(600,10000));
        $this->assertFalse(ReplayTimeGuard::permits(0,10000));
    }

    public function test_periodicity_is_not_inferred_from_short_or_held_inputs(): void
    {
        $this->assertNull(ReplayRiskAnalysis::cadence([['tick'=>0,'mask'=>1]],3600));
        $regular = $variable = [];
        $t = 0;
        for ($i=0;$i<40;$i++) {
            $regular[] = ['tick'=>$i*90,'mask'=>1];
            $regular[] = ['tick'=>$i*90+2,'mask'=>0];
            $variable[] = ['tick'=>$t,'mask'=>1];
            $variable[] = ['tick'=>$t+2,'mask'=>0];
            $t += 40 + ($i%7)*11;
        }
        $this->assertNull(ReplayRiskAnalysis::cadence($regular,1000));
        $this->assertNull(ReplayRiskAnalysis::cadence($variable,4000));
        $this->assertSame(10000, ReplayRiskAnalysis::cadence($regular,3600)['dominant_cluster_bps']);
    }

    public function test_risk_deduplicates_and_excludes_shared_network_identity(): void
    {
        $row = static fn($signal,$risk) => (object)['signal'=>$signal,'risk_score'=>$risk];
        $shared = [$row('shared_network_cohort',35),$row('shared_installation',25),$row('duplicate_verified_phone',50)];
        $this->assertSame(0,ReplayRiskAnalysis::aggregate($shared)['risk']);
        $single = [...$shared,$row('cross_account_replay',75),$row('cross_account_replay',75)];
        $this->assertSame(69,ReplayRiskAnalysis::aggregate($single)['risk']);
        $combined = [...$single,$row('dense_control_trace',25),$row('periodic_jump_cadence',30)];
        $r = ReplayRiskAnalysis::aggregate($combined);
        $this->assertSame(100,$r['risk']);
        $this->assertSame(2,$r['families']);
        $this->assertSame('high',$r['priority']);
    }
}
