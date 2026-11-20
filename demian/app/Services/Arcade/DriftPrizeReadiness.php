<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;

final class DriftPrizeReadiness
{
    public const VERSION = 'drift-prize-acceptance-v1';
    public const FILES = [
        'resources/game/cafe-drift-rules.json',
        'resources/js/game/games/cafe-drift/CafeDriftModel.js',
        'resources/js/game/games/cafe-drift/CafeDriftGame.js',
        'resources/js/game/games/cafe-drift/CafeDriftRenderer.js',
        'resources/css/cafe-drift.css',
        'app/Services/Arcade/CafeDriftReplayVerifier.php',
        'app/Services/Arcade/ArcadeTurnRunService.php',
        'app/Services/Arcade/ReplayCompletionService.php',
        'app/Services/Arcade/ReplayTimeGuard.php',
        'app/Services/Arcade/ArcadeAntiCheat.php',
        'app/Services/Arcade/DynamicWinnerAllocation.php',
        'app/Services/Arcade/WeeklyAllocationService.php',
        'app/Services/Arcade/VerifiedPrizeIdentity.php',
        'app/Services/Arcade/CouponIssuanceService.php',
        'app/Services/Arcade/CampaignEconomics.php',
        'app/Services/Arcade/DriftPrizeReadiness.php',
        'app/Services/Arcade/RankedGameCatalog.php',
        'app/Services/Arcade/WeeklyCompetitionService.php',
        'app/Services/Arcade/WeeklySettlementService.php',
        'app/Services/Arcade/PhoneIdentityService.php',
    ];
    public const REVIEW_CHECKS = [
        'physical_android_touch','physical_ios_touch','desktop_keyboard',
        'equal_input_equal_score','background_and_disconnect','server_replay',
        'cross_account_and_retry','automated_solver_risk','cashier_coupon_redemption',
        'privacy_and_identity','owner_budget',
    ];

    public function required(): bool
    {
        return !app()->environment('testing') || config('demian-arcade.drift_acceptance_required')===true;
    }

    public function approved(): bool
    {
        if (!$this->required()) return true;
        return $this->inspect()['passed'];
    }

    public function sourceHashes(): array
    {
        $hashes=[];
        foreach(self::FILES as $path) {
            $full=base_path($path);
            if (!is_file($full) || !is_readable($full)) return [];
            $sha=hash_file('sha256',$full);
            if (!is_string($sha)) return [];
            $hashes[$path]=$sha;
        }
        ksort($hashes,SORT_STRING);
        return $hashes;
    }

    public function evidenceValid(array $evidence, array $hashes, CarbonImmutable $now): bool
    {
        if (($evidence['schema']??null)!==1 || ($evidence['policy']??null)!==self::VERSION
            || ($evidence['rules_version']??null)!==CafeDriftReplayVerifier::VERSION
            || ($evidence['status']??null)!=='approved' || count($hashes)!==count(self::FILES)
            || !is_array($evidence['source_hashes']??null) || !is_array($evidence['checks']??null)
            || !is_int($evidence['independent_pilot_participants']??null) || $evidence['independent_pilot_participants']<20
            || !is_string($evidence['reviewer']??null) || trim($evidence['reviewer'])==='' 
            || !is_string($evidence['evidence_reference']??null) || trim($evidence['evidence_reference'])==='') return false;
        $recorded=$evidence['source_hashes'];
        ksort($recorded,SORT_STRING);
        if ($recorded!==$hashes) return false;
        foreach(self::FILES as $file) if (!is_string($hashes[$file]??null) || !preg_match('/^[a-f0-9]{64}$/D',$hashes[$file])) return false;
        foreach(self::REVIEW_CHECKS as $check) if (($evidence['checks'][$check]??null)!==true) return false;
        foreach(['reviewed_on','eligible_from'] as $field) {
            if (!is_string($evidence[$field]??null) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$evidence[$field])) return false;
        }
        try {
            $review=CarbonImmutable::createFromFormat('!Y-m-d',$evidence['reviewed_on'],'Asia/Tehran');
            $from=CarbonImmutable::createFromFormat('!Y-m-d',$evidence['eligible_from'],'Asia/Tehran');
            if (!$review || !$from || $review->format('Y-m-d')!==$evidence['reviewed_on']
                || $from->format('Y-m-d')!==$evidence['eligible_from']) return false;
            $local=$now->setTimezone('Asia/Tehran');
            return $review->lte($local) && $local->lt($review->addDays(90))
                && $from->isSaturday() && $from->gt($review)
                && $from->lte($local->startOfWeek(CarbonImmutable::SATURDAY));
        } catch (\Throwable) { return false; }
    }

    public function inspect(): array
    {
        $checks=[];
        $checks['ranked_enabled']=config('demian-arcade.drift_ranked_enabled')===true;
        $checks['prizes_requested']=config('demian-arcade.drift_prizes_enabled')===true;
        $checks['anticheat_enabled']=app(ArcadeAntiCheat::class)->enabled();
        $checks['identity_required_and_ready']=app(PhoneIdentityService::class)->required() && app(PhoneIdentityService::class)->ready();
        $checks['settlement_enabled']=config('demian-arcade.weekly_settlement_enabled')===true;
        $checks['owner_coupon_policy']=config('demian-coupons.policy_approved')===true
            && config('demian-coupons.campaigns_enabled')===true && config('demian-coupons.issue_enabled')===true
            && config('demian-coupons.cafe_enabled')===true;
        $checks['legal_ready']=config('demian-legal.publication_approved')===true && config('demian-legal.require_acceptance')===true;
        try {
            $checks['budget_approved']=app(CampaignEconomics::class)->required() && app(CampaignEconomics::class)->ceiling()>0
                && app(WeeklyAllocationService::class)->required();
        } catch (\Throwable) { $checks['budget_approved']=false; }
        try {
            $path=resource_path('game/cafe-drift-prize-acceptance.json');
            $evidence=is_file($path)?json_decode(file_get_contents($path),true,flags:JSON_THROW_ON_ERROR):[];
            $checks['version_bound_manual_acceptance']=is_array($evidence)
                && $this->evidenceValid($evidence,$this->sourceHashes(),CarbonImmutable::now('UTC'));
        } catch (\Throwable) { $checks['version_bound_manual_acceptance']=false; }
        return ['policy'=>self::VERSION,'passed'=>!in_array(false,$checks,true),'checks'=>$checks];
    }
}
