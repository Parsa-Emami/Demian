<?php

namespace Tests\Unit;

use App\Services\Arcade\ReplayRiskAnalysis;
use PHPUnit\Framework\TestCase;

final class ReplayRiskAnalysisTest extends TestCase
{
    public function test_review_priority_counts_each_family_once_and_leaves_network_context_unweighted(): void
    {
        $reports = [
            (object) ['signal' => 'statistical_score_outlier', 'risk_score' => 40],
            (object) ['signal' => 'short_high_score', 'risk_score' => 45],
            (object) ['signal' => 'short_high_score', 'risk_score' => 45],
            (object) ['signal' => 'shared_network_rejections', 'risk_score' => 30],
        ];
        $this->assertSame(['risk' => 45, 'families' => 1], ReplayRiskAnalysis::priority($reports));
        $reports[] = (object) ['signal' => 'overlapping_verified_runs', 'risk_score' => 65];
        $this->assertSame(['risk' => 100, 'families' => 2], ReplayRiskAnalysis::priority($reports));
    }

    public function test_periodicity_counts_rising_edges_and_requires_substantial_evidence(): void
    {
        $events = [];
        for ($tick = 20; $tick < 2800; $tick += 100) {
            $events[] = ['tick' => $tick, 'mask' => 1];
            $events[] = ['tick' => $tick + 1, 'mask' => 3];
            $events[] = ['tick' => $tick + 8, 'mask' => 0];
        }
        $evidence = ReplayRiskAnalysis::cadence($events, 2800);
        $this->assertSame(27, $evidence['intervals']);
        $this->assertSame(10000, $evidence['dominant_cluster_bps']);
        $this->assertNull(ReplayRiskAnalysis::cadence(array_slice($events, 0, 30), 2800));
        $this->assertNull(ReplayRiskAnalysis::cadence($events, 240));
    }
}
