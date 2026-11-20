<?php

namespace App\Services\Arcade;

final class LoyaltyXpPolicy
{
    public const VERSION = 'loyalty-xp-v1';
    public const WEEKLY_CAP = 225;
    public const LEVEL_STEP = 250;
    public const TIERS = ['member'=>0,'regular'=>500,'loyal'=>1500,'vip'=>3000,'ambassador'=>6000];

    public static function calculate(int $games, bool $breakthrough, bool $consecutive): array
    {
        if ($games < 1 || $games > count(PersonalProgressService::GAMES)) {
            throw new \InvalidArgumentException('Invalid distinct game count.');
        }
        $participation=100;
        $variety=min(2,$games-1)*25;
        $progress=$breakthrough?50:0;
        $continuity=$consecutive?25:0;
        return ['participation_xp'=>$participation,'variety_xp'=>$variety,
            'progress_xp'=>$progress,'continuity_xp'=>$continuity,
            'total_xp'=>$participation+$variety+$progress+$continuity];
    }

    public static function level(int $xp): array
    {
        if ($xp<0) throw new \InvalidArgumentException('Invalid XP.');
        $tier='member'; $nextTier=null; $nextTierXp=null;
        foreach (self::TIERS as $name=>$threshold) {
            if ($xp >= $threshold) $tier=$name;
            else { $nextTier=$name; $nextTierXp=$threshold; break; }
        }
        return ['level'=>intdiv($xp,self::LEVEL_STEP)+1,'level_progress_xp'=>$xp%self::LEVEL_STEP,
            'level_step_xp'=>self::LEVEL_STEP,'tier'=>$tier,'next_tier'=>$nextTier,'next_tier_xp'=>$nextTierXp];
    }

    public static function rules(): array
    {
        return ['version'=>self::VERSION,'weekly_cap'=>self::WEEKLY_CAP+MissionPolicy::CAP,'base_weekly_cap'=>self::WEEKLY_CAP,'mission_weekly_cap'=>MissionPolicy::CAP,
            'participation_xp'=>100,'additional_game_xp'=>25,'additional_game_cap'=>2,
            'breakthrough_xp'=>50,'consecutive_week_xp'=>25,'tiers'=>self::TIERS,
            'mission_xp_enabled'=>true,'financial_rewards'=>false,'currency_budget_minor'=>0,
            'transferable'=>false,'purchaseable'=>false];
    }
}
