<?php

namespace App\Services\Arcade;

use RuntimeException;

final class SkillLeaguePolicy
{
    public const VERSION = 'skill-league-v1';
    public const MIN_COHORT = 20;
    public const TIERS = ['bronze','silver','gold','legend'];
    public const THRESHOLDS = [0, 450, 700, 900];
    public const DEMOTION_WEEKS = 3;
    public const DEMOTION_MARGIN = 100;

    public static function rules(): array
    {
        return [
            'version' => self::VERSION, 'minimum_cohort' => self::MIN_COHORT,
            'tiers' => array_combine(self::TIERS, self::THRESHOLDS),
            'max_points' => 1000, 'demotion_weeks' => self::DEMOTION_WEEKS,
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
        if ($points < 0 || $points > 1000) throw new RuntimeException('Invalid league points.');
        return $points >= 900 ? 3 : ($points >= 700 ? 2 : ($points >= 450 ? 1 : 0));
    }

    // Immutable prior finalized history, in chronological order; never
    // trust a client-selected league or count incomplete/unqualified weeks.
    public static function classify(array $history, ?int $points): array
    {
        $level = null; $peak = 0; $low = 0; $movement = 'placement';
        foreach ([...$history, $points] as $score) {
            $movement = 'stable';
            if ($score === null) continue;
            $target = self::tier($score);
            if ($level === null) {
                $level = $target; $peak = $target; $movement = 'placed'; $low = 0;
            } elseif ($target > $level) {
                $level = $target; $peak = max($peak, $level); $movement = 'promoted'; $low = 0;
            } elseif ($level > max(0, $peak - 1)
                && $score < self::THRESHOLDS[$level] - self::DEMOTION_MARGIN) {
                if (++$low >= self::DEMOTION_WEEKS) {
                    --$level; $low = 0; $movement = 'demoted';
                }
            } else {
                $low = 0;
            }
        }
        return ['league' => $level === null ? 'placement' : self::TIERS[$level],
            'peak_tier' => $peak, 'low_weeks' => $low,
            'movement' => $points === null ? 'provisional' : $movement];
    }

    /** One vetted best per game per player, one best qualified contribution
     * overall. Midrank means twenty tied accounts get 500, not 1000. */
    public static function normalize(array $snapshot): array
    {
        $games = []; $seen = []; $versions = []; $best = [];
        foreach ($snapshot as $row) {
            $game = $row['game_id']; $id = $row['player_id']; $version = $row['rules_version'];
            if (isset($seen[$game][$id]) || (isset($versions[$game]) && $versions[$game] !== $version)) {
                throw new RuntimeException('Invalid league cohort: duplicated best or mixed rules.');
            }
            $seen[$game][$id] = true; $versions[$game] = $version;
            $games[$game][] = $row;
        }
        ksort($games, SORT_STRING);
        foreach ($games as $game => $rows) {
            usort($rows, static fn($a,$b) => ($b['score'] <=> $a['score'])
                ?: strcmp($a['achieved_at'],$b['achieved_at']) ?: strcmp($a['player_id'],$b['player_id']));
            $n = count($rows);
            for ($i=0; $i<$n;) {
                $j=$i+1;
                while ($j<$n && $rows[$j]['score']===$rows[$i]['score']) ++$j;
                $points = $n >= self::MIN_COHORT
                    ? intdiv(1000 * (2 * ($n-1-$i) - ($j-$i-1)), 2*($n-1)) : 0;
                for ($k=$i;$k<$j;++$k) {
                    $r=$rows[$k];
                    $entry=['player_id'=>$r['player_id'],'run_id'=>$r['run_id'],
                        'source_game_id'=>$game,'achieved_at'=>$r['achieved_at'],
                        'points'=>$points,'cohort_size'=>$n,'qualified'=>$n>=self::MIN_COHORT];
                    $old=$best[$r['player_id']]??null;
                    if (!$old || ((int)$entry['qualified'] > (int)$old['qualified'])
                        || ($entry['qualified']===$old['qualified'] && ($points>$old['points']
                            || ($points===$old['points'] && strcmp($entry['achieved_at'],$old['achieved_at'])<0)))) {
                        $best[$r['player_id']]=$entry;
                    }
                }
                $i=$j;
            }
        }
        ksort($best, SORT_STRING);
        return array_values($best);
    }
}
