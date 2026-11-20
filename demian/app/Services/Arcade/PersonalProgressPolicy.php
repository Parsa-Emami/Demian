<?php

namespace App\Services\Arcade;

final class PersonalProgressPolicy
{
    public const VERSION = 'personal-progress-v1';
    public const PLACEMENT_WEEKS = 3;
    public const MIN_STEP = 25;
    public const STEP_BPS = 500;
    public const MAX_SCORE = 4294967295;

    public static function goal(?int $best, int $weeks): ?int
    {
        if ($best === null || $weeks < self::PLACEMENT_WEEKS) return null;
        $increment = max(self::MIN_STEP, intdiv($best * self::STEP_BPS + 9999, 10000));
        return $best + $increment <= self::MAX_SCORE ? $best + $increment : null;
    }

    public static function evaluate(int $score, ?int $best, int $weeks, bool $late = false): array
    {
        if ($score < 0 || $score > self::MAX_SCORE || $weeks < 0 || ($best !== null && ($best < 0 || $best > self::MAX_SCORE))) {
            throw new \InvalidArgumentException('Invalid progress evidence.');
        }
        $target = self::goal($best, $weeks);
        $record = $best !== null && $score > $best;
        $badge = !$late && $target !== null && $score >= $target ? 'personal-breakthrough' : null;
        return [
            'previous_best'=>$best, 'previous_weeks'=>$weeks, 'target_score'=>$target,
            'personal_record'=>$record, 'badge'=>$badge,
            'status'=>$late ? 'late' : ($weeks < self::PLACEMENT_WEEKS ? 'calibrating' : ($badge ? 'goal_met' : ($record ? 'personal_record' : 'recorded'))),
        ];
    }

    public static function rules(): array
    {
        return ['version'=>self::VERSION,'placement_weeks'=>self::PLACEMENT_WEEKS,
            'minimum_increment'=>self::MIN_STEP,'increment_bps'=>self::STEP_BPS,
            'baseline'=>'highest_prior_sealed_weekly_score_same_game_and_rules',
            'financial_rewards'=>false,'currency_budget_minor'=>0,
            'late_seal_recognition'=>false];
    }
}
