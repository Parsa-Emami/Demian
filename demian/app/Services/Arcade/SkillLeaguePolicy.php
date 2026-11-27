<?php

namespace App\Services\Arcade;

use RuntimeException;

final class SkillLeaguePolicy
{
    public const VERSION = 'skill-league-v1';

    public const MIN_COHORT = 20;

    public const TIERS = ['bronze', 'silver', 'gold', 'legend'];

    public const THRESHOLDS = [0, 450, 700, 900];

    public const MAX_POINTS = 1000;

    public const DEMOTION_WEEKS = 3;

    public const DEMOTION_MARGIN = 100;

    public static function rules(): array
    {
        return [
            'version' => self::VERSION,
            'minimum_cohort' => self::MIN_COHORT,
            'tiers' => array_combine(self::TIERS, self::THRESHOLDS),
            'max_points' => self::MAX_POINTS,
            'demotion_weeks' => self::DEMOTION_WEEKS,
            'demotion_margin' => self::DEMOTION_MARGIN,
            'peak_floor' => 'at_most_one_tier_below_lifetime_peak',
            'promotion' => 'immediate_at_finalized_qualified_week',
            'inactive_or_sparse_week' => 'no_demotion',
            'formula' => 'midrank_percentile_per_verified_phone_cohort; best_qualified_game_only',
            'financial_rewards' => false,
            'recognition' => 'nonfinancial_top_three_ranks_per_qualified_league',
            'status' => 'pilot_calibration_required',
        ];
    }

    public static function tier(int $points): int
    {
        if ($points < 0 || $points > self::MAX_POINTS) {
            throw new RuntimeException('Invalid league points.');
        }

        foreach (array_reverse(self::THRESHOLDS, true) as $tier => $minimum) {
            if ($points >= $minimum) {
                return $tier;
            }
        }

        return 0;
    }

    public static function classify(array $history, ?int $points): array
    {
        $level = null;
        $peak = 0;
        $lowWeeks = 0;
        $movement = 'provisional';
        foreach ([...$history, $points] as $score) {
            if ($score === null) {
                continue;
            }
            $target = self::tier($score);
            $movement = 'stable';
            if ($level === null || $target > $level) {
                $movement = $level === null ? 'placed' : 'promoted';
                $level = $target;
                $peak = max($peak, $level);
                $lowWeeks = 0;
            } elseif ($level > max(0, $peak - 1)
                && $score < self::THRESHOLDS[$level] - self::DEMOTION_MARGIN) {
                $lowWeeks++;
                if ($lowWeeks === self::DEMOTION_WEEKS) {
                    $level--;
                    $lowWeeks = 0;
                    $movement = 'demoted';
                }
            } else {
                $lowWeeks = 0;
            }
        }

        return [
            'league' => $level === null ? 'placement' : self::TIERS[$level],
            'peak_tier' => $peak,
            'low_weeks' => $lowWeeks,
            'movement' => $points === null ? 'provisional' : $movement,
        ];
    }

    public static function normalize(array $snapshot): array
    {
        $games = [];
        $versions = [];
        foreach ($snapshot as $row) {
            $game = $row['game_id'];
            $player = $row['player_id'];
            $version = $row['rules_version'];
            if (isset($games[$game][$player]) || (isset($versions[$game]) && $versions[$game] !== $version)) {
                throw new RuntimeException('Invalid league cohort: duplicated best or mixed rules.');
            }
            $versions[$game] = $version;
            $games[$game][$player] = $row;
        }
        ksort($games, SORT_STRING);

        $best = [];
        foreach ($games as $game => $rows) {
            usort($rows, static fn (array $a, array $b): int => ($b['score'] <=> $a['score'])
                ?: strcmp($a['achieved_at'], $b['achieved_at']) ?: strcmp($a['player_id'], $b['player_id']));
            $count = count($rows);
            $qualified = $count >= self::MIN_COHORT;
            for ($first = 0; $first < $count; $first = $next) {
                $next = $first + 1;
                while ($next < $count && $rows[$next]['score'] === $rows[$first]['score']) {
                    $next++;
                }
                $midrank = 2 * ($count - 1) - $first - ($next - 1);
                $points = $qualified ? intdiv(self::MAX_POINTS * $midrank, 2 * ($count - 1)) : 0;
                for ($i = $first; $i < $next; $i++) {
                    $row = $rows[$i];
                    $player = $row['player_id'];
                    $candidate = [
                        'player_id' => $player,
                        'run_id' => $row['run_id'],
                        'source_game_id' => $game,
                        'achieved_at' => $row['achieved_at'],
                        'points' => $points,
                        'cohort_size' => $count,
                        'qualified' => $qualified,
                    ];
                    $current = $best[$player] ?? null;
                    if ($current === null || self::compareContributions($candidate, $current) < 0) {
                        $best[$player] = $candidate;
                    }
                }
            }
        }
        ksort($best, SORT_STRING);

        return array_values($best);
    }

    private static function compareContributions(array $a, array $b): int
    {
        return ($b['qualified'] <=> $a['qualified'])
            ?: ($b['points'] <=> $a['points'])
            ?: strcmp($a['achieved_at'], $b['achieved_at'])
            ?: strcmp($a['source_game_id'], $b['source_game_id']);
    }
}
