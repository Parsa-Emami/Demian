<?php

namespace App\Services\Arcade;

final class ReplayRiskAnalysis
{
    private const FAMILIES = [
        'start_velocity' => 'activity',
        'overlapping_verified_runs' => 'activity',
        'invalid_replay_velocity' => 'validation',
        'cross_account_replay' => 'reuse',
        'statistical_score_outlier' => 'score',
        'short_high_score' => 'score',
        'dense_control_trace' => 'controls',
        'periodic_jump_cadence' => 'controls',
    ];

    public static function cadence(array $events, int $ticks): ?array
    {
        if ($ticks < 1800 || count($events) < 25 || count($events) > 12000) {
            return null;
        }

        $previousMask = 0;
        $previousJump = null;
        $gaps = [];
        foreach ($events as $event) {
            if (! is_array($event) || ! is_int($event['tick'] ?? null) || ! is_int($event['mask'] ?? null)) {
                return null;
            }
            if (($event['mask'] & 1) && ! ($previousMask & 1)) {
                if ($previousJump !== null) {
                    $gaps[] = $event['tick'] - $previousJump;
                }
                $previousJump = $event['tick'];
            }
            $previousMask = $event['mask'];
        }
        if (count($gaps) < 24) {
            return null;
        }

        $histogram = array_count_values($gaps);
        $largestCluster = 0;
        foreach ($histogram as $gap => $count) {
            if ($gap >= 12 && $gap <= 600) {
                $largestCluster = max($largestCluster,
                    $count + ($histogram[$gap - 1] ?? 0) + ($histogram[$gap + 1] ?? 0));
            }
        }
        $share = intdiv($largestCluster * 10000, count($gaps));
        return $share >= 9500 ? [
            'intervals' => count($gaps), 'dominant_cluster_bps' => $share, 'duration_ticks' => $ticks,
        ] : null;
    }

    public static function priority(iterable $reports): array
    {
        $families = [];
        foreach ($reports as $report) {
            $family = self::FAMILIES[$report->signal] ?? null;
            if ($family !== null) {
                $weight = max(0, min(100, (int) $report->risk_score));
                $families[$family] = max($families[$family] ?? 0, $weight);
            }
        }
        $risk = min(count($families) >= 2 ? 100 : 69, array_sum($families));
        return ['risk' => $risk, 'families' => count($families)];
    }
}
