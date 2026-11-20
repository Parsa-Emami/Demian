<?php

namespace App\Services\Arcade;

/**
 * Analyze server-verified runner controls, not client clocks or browser
 * fingerprints. These coarse statistics are review hints, never proof of bots.
 */
final class ReplayRiskAnalysis
{
    public static function cadence(array $events, int $ticks): ?array
    {
        if ($ticks < 1800 || count($events) < 25 || count($events) > 12000) return null;
        // Runner masks only. Measure rising jump edges so holding a button,
        // keyboard accessibility tools and ordinary frame quantization do not
        // count as repeated presses.
        $prior = 0; $previousJump = null; $gaps = [];
        foreach ($events as $event) {
            if (! is_array($event) || ! is_int($event['tick'] ?? null)
                || ! is_int($event['mask'] ?? null)) return null;
            $mask = $event['mask'];
            if (($mask & 1) && ! ($prior & 1)) {
                $tick = $event['tick'];
                if ($previousJump !== null) $gaps[] = $tick - $previousJump;
                $previousJump = $tick;
            }
            $prior = $mask;
        }
        if (count($gaps) < 24) return null;
        // Quantized periodicity: narrow 3-tick cluster at meaningful gaps.
        // No autocorrelation over individual events, and no raw input retained.
        $hist = array_count_values($gaps);
        $max = 0;
        foreach ($hist as $gap => $n) {
            if ($gap < 12 || $gap > 600) continue;
            $max = max($max, $n + ($hist[$gap-1] ?? 0) + ($hist[$gap+1] ?? 0));
        }
        $bps = intdiv($max * 10000, count($gaps));
        if ($bps < 9500) return null;
        return ['intervals' => count($gaps), 'dominant_cluster_bps' => $bps, 'duration_ticks' => $ticks];
    }

    /** A repeated signal contributes once; correlated families contribute max,
     * not sum. A shared IP/install and identity conflict never increase
     * gameplay risk. No probability of cheating is asserted. */
    public static function aggregate(iterable $rows): array
    {
        $families = [];
        $signals = [];
        $family = [
            'start_velocity' => 'activity',
            'invalid_replay_velocity' => 'validation',
            'cross_account_replay' => 'reuse',
            'statistical_score_outlier' => 'score',
            'short_high_score' => 'score',
            'dense_control_trace' => 'controls',
            'periodic_jump_cadence' => 'controls',
            'parallel_ranked_runs' => 'activity',
        ];
        foreach ($rows as $row) {
            $kind = $row->signal;
            if (! isset($family[$kind])) continue;
            $score = max(0, min(100, (int) $row->risk_score));
            $group = $family[$kind];
            $families[$group] = max($families[$group] ?? 0, $score);
            $signals[$kind] = true;
        }
        $risk = min(100, array_sum($families));
        // One ambiguous family may be a good player or poor connection.
        // High priority requires independent types of evidence.
        if (count($families) < 2) $risk = min(69, $risk);
        return ['risk' => $risk, 'families' => count($families),
            'signals' => count($signals), 'priority' => $risk >= 70 ? 'high' : ($risk >= 35 ? 'medium' : 'low')];
    }
}
