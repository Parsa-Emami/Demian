<?php

namespace App\Services\Arcade;

use RuntimeException;

/** Versioned, integer-only seat allocation; never grants financial eligibility. */
final class DynamicWinnerAllocation
{
    public const VERSION = 'dynamic-first-time-v1';
    public const CAPS = [
        'after-hours' => 5, 'cafe-critters' => 5, 'cafe-drift' => 10,
        'cafe-rush' => 8, 'coffee-crash' => 8, 'dino-run' => 10, 'open-world' => 4,
    ];

    public static function policy(): array
    {
        return ['version' => self::VERSION, 'min_participants' => 20,
            'target_bps' => 1500, 'game_caps' => self::CAPS];
    }

    public static function canonical(array $policy): array
    {
        if (! isset($policy['game_caps']) || ! is_array($policy['game_caps'])) {
            throw new RuntimeException('Invalid frozen allocation policy.');
        }
        ksort($policy['game_caps'], SORT_STRING);
        $expected = self::policy();
        if (count($policy) !== count($expected)) throw new RuntimeException('Invalid allocation policy fields.');
        foreach ($expected as $key => $value) {
            if (($policy[$key] ?? null) !== $value) throw new RuntimeException('Unknown or modified allocation policy.');
        }
        return $expected;
    }

    /** Counts are distinct verified accounts, not attempts. Ineligible accounts
     * count toward participation, but cannot receive a seat. */
    public function allocate(array $rankings, array $historical, array $excluded, int $capacity, array $policy): array
    {
        $policy = self::canonical($policy);
        if ($capacity < 0 || $capacity > 200) throw new RuntimeException('Invalid funded capacity.');
        ksort($rankings, SORT_STRING);
        $blocked = array_fill_keys($excluded, true);
        $all = $eligible = $stats = $limits = $quotas = [];
        foreach ($rankings as $game => $rows) {
            if (! isset($policy['game_caps'][$game])) throw new RuntimeException('Unknown prize game.');
            $ids = [];
            foreach ($rows as $row) {
                if (($row['verified'] ?? null) !== true || ! is_string($row['player_id'] ?? null)
                    || trim($row['player_id']) === '') throw new RuntimeException('Unverified prize participant.');
                $ids[$row['player_id']] = true;
            }
            $n = count($ids);
            $available = array_diff_key($ids, $blocked);
            $all += $ids;
            $eligible += $available;
            $limits[$game] = $n < $policy['min_participants'] ? 0 : min(
                count($available), $policy['game_caps'][$game], intdiv($n * $policy['target_bps'], 10000)
            );
            $quotas[$game] = 0;
            $stats[$game] = ['participants' => $n, 'eligible' => count($available), 'target' => $limits[$game]];
        }
        // One seat per qualified game before proportional allocation, if funded.
        // Remaining seats use highest averages with stable game-ID tie breaks.
        $order = array_keys($limits);
        usort($order, fn ($a, $b) => ($stats[$b]['participants'] <=> $stats[$a]['participants']) ?: strcmp($a, $b));
        $left = min($capacity, count($eligible));
        foreach ($order as $game) {
            if ($left > 0 && $limits[$game] > 0) { $quotas[$game]++; $left--; }
        }
        while ($left > 0) {
            $best = null;
            foreach ($order as $game) {
                if ($quotas[$game] >= $limits[$game]) continue;
                if ($best === null || $stats[$game]['participants'] * ($quotas[$best] + 1)
                    > $stats[$best]['participants'] * ($quotas[$game] + 1)) $best = $game;
            }
            if ($best === null) break;
            $quotas[$best]++;
            $left--;
        }
        $selector = new WeeklyPrizeSelector();
        $winners = $selector->select($rankings, $historical, $excluded, $quotas);
        $count = array_sum(array_map('count', $winners));
        // If overlapping accounts leave seats empty, transfer only unused seats
        // to another eligible game below its target. Never evict a filled seat.
        while ($count < min($capacity, array_sum($limits))) {
            $base = [];
            foreach ($winners as $game => $rows) $base[$game] = count($rows);
            $improved = false;
            foreach ($order as $game) {
                if ($base[$game] >= $limits[$game]) continue;
                $trial = $base;
                $trial[$game]++;
                $next = $selector->select($rankings, $historical, $excluded, $trial);
                $nextCount = array_sum(array_map('count', $next));
                if ($nextCount > $count) {
                    $quotas = $trial;
                    $winners = $next;
                    $count = $nextCount;
                    $improved = true;
                    break;
                }
            }
            if (! $improved) break;
        }
        foreach ($stats as $game => &$row) {
            $row['quota'] = $quotas[$game];
            $row['winners'] = count($winners[$game]);
            $row['award_rate_bps'] = $row['participants'] > 0 ? intdiv($row['winners'] * 10000, $row['participants']) : null;
        }
        unset($row);
        return ['winners' => $winners, 'summary' => [
            'algorithm' => self::VERSION, 'funded_capacity' => $capacity,
            'participants' => count($all), 'eligible' => count($eligible),
            'winner_count' => $count, 'unallocated_capacity' => $capacity - $count,
            'award_rate_bps' => count($all) > 0 ? intdiv($count * 10000, count($all)) : null,
            'games' => $stats,
        ]];
    }

    /** Canonical winner digest separate from the pre-existing technical digest. */
    public static function winnerDigest(iterable $rows): string
    {
        $canonical = [];
        foreach ($rows as $row) {
            $row = (array) $row;
            $canonical[] = [
                'period_key' => $row['period_key'], 'game_id' => $row['game_id'],
                'rules_version' => $row['rules_version'], 'player_id' => $row['player_id'],
                'run_id' => $row['run_id'], 'score' => (int) $row['score'],
                'achieved_at' => (string) $row['achieved_at'], 'technical_rank' => (int) $row['technical_rank'],
                'prize_rank' => (int) $row['prize_rank'], 'previous_winner' => (bool) $row['previous_winner'],
                'created_at' => (string) $row['created_at'],
            ];
        }
        usort($canonical, static fn ($a, $b) => strcmp($a['game_id'], $b['game_id']) ?: ($a['prize_rank'] <=> $b['prize_rank']));
        return hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR));
    }
}
