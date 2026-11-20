<?php

namespace App\Services\Arcade;

final class MissionPolicy
{
    public const VERSION='daily-weekly-missions-v1';
    public const CAP=75;

    public static function evaluate(int $mask, int $games, bool $adaptive): array
    {
        if ($mask<0 || $mask>127 || $games<0 || $games>7 || (($mask===0)!==($games===0)) || ($adaptive && !$games)) {
            throw new \InvalidArgumentException('Invalid mission evidence.');
        }
        $days=substr_count(decbin($mask),'1');
        $daily=$days*5;
        $consistency=$days>=3?15:0;
        $variety=$games>=2?10:0;
        $goal=$adaptive?15:0;
        return ['day_mask'=>$mask,'active_days'=>$days,'distinct_games'=>$games,'daily_xp'=>$daily,
            'consistency_xp'=>$consistency,'variety_xp'=>$variety,'adaptive_xp'=>$goal,
            'total_xp'=>$daily+$consistency+$variety+$goal];
    }

    public static function rules(): array
    {
        return ['version'=>self::VERSION,'day_timezone'=>'Asia/Tehran','daily_xp'=>5,'daily_days_cap'=>7,
            'consistency_days'=>3,'consistency_xp'=>15,'variety_games'=>2,'variety_xp'=>10,
            'adaptive_xp'=>15,'weekly_cap'=>self::CAP,'minimum_score'=>1,'financial_rewards'=>false,
            'award_time'=>'weekly_seal','goal_source'=>'prior_sealed_same_game_version_at_week_start'];
    }
}
