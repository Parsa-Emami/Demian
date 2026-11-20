<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Domain\Arcade\WeeklyContent;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use FilesystemIterator;

final class MultiGamePrizeReadiness
{
    public const POLICY='multi-game-prize-acceptance-v1';
    public const GAMES=[
        'cafe-critters'=>['flag'=>'critters_prizes_enabled','legacy'=>'cafe-critters-replay-v1','verifier'=>'CafeCrittersReplayVerifier','risk'=>'public_solution_and_speed_automation'],
        'coffee-crash'=>['flag'=>'coffee_prizes_enabled','legacy'=>'coffee-crash-replay-v1','verifier'=>'CoffeeCrashReplayVerifier','risk'=>'seeded_solver_and_undo_automation'],
        'after-hours'=>['flag'=>'after_hours_prizes_enabled','legacy'=>'after-hours-frames-v1','verifier'=>'AfterHoursFrameReplayVerifier','risk'=>'shadow_path_and_collision_automation'],
        'cafe-rush'=>['flag'=>'cafe_rush_prizes_enabled','legacy'=>'cafe-rush-frames-v1','verifier'=>'CafeRushFrameReplayVerifier','risk'=>'order_macro_and_station_reach_automation'],
    ];
    public const CHECKS=['server_replay_parity','tamper_and_terminal_state','cross_account_and_retry',
        'physical_android_touch','physical_ios_touch','desktop_keyboard','equal_input_equal_score',
        'background_and_disconnect','game_specific_automation_risk','identical_competitive_scope',
        'privacy_and_identity','cashier_coupon_redemption','owner_budget'];

    public function requested(string $game): bool
    {
        return isset(self::GAMES[$game]) && config('demian-arcade.'.self::GAMES[$game]['flag'])===true;
    }

    public function required(string $game): bool
    {
        return !app()->environment('testing') || config('demian-arcade.multi_game_acceptance_required')===true
            || in_array($game,['after-hours','cafe-rush'],true);
    }

    public function originalScope(string $game): bool
    {
        if (!isset(self::GAMES[$game])) return false;
        if (in_array($game,['after-hours','cafe-rush'],true)) {
            return config('demian-arcade.gameplay_ranked_enabled.'.$game)===true
                && config('demian-arcade.route_ranked_enabled.'.$game)!==true;
        }
        return app(RankedGameCatalog::class)->supportsRanked($game);
    }

    public function currentVersion(string $game, CarbonImmutable $now): ?string
    {
        if (!isset(self::GAMES[$game])) return null;
        return WeeklyContent::effectiveVersion($game,self::GAMES[$game]['legacy'],$now,config('demian-arcade.weekly_content_at'));
    }

    public function sourceHashes(string $game): array
    {
        if (!isset(self::GAMES[$game])) return [];
        $paths=[
            'resources/game/weekly-content.json',
            'resources/css/'.$game.'.css',
            'resources/js/game/content/WeeklyContent.js',
            'resources/js/game/leaderboard/ArcadeLeaderboardService.js',
            'resources/js/game/leaderboard/RankedGameplayChallenge.js',
            'resources/js/game/core/InputController.js',
            'src/Domain/Arcade/WeeklyContent.php',
            'src/Domain/Arcade/VerifiedReplay.php',
            'app/Services/Arcade/'.self::GAMES[$game]['verifier'].'.php',
        ];
        foreach(['MultiGamePrizeReadiness','RankedGameCatalog','ArcadeTurnRunService','ReplayCompletionService',
            'ReplayTimeGuard','ArcadeAntiCheat','WeeklyCompetitionService','WeeklySettlementService',
            'DynamicWinnerAllocation','WeeklyAllocationService','VerifiedPrizeIdentity','PhoneIdentityService',
            'CouponIssuanceService','CampaignEconomics','RewardCampaignService','InCafeCouponService'] as $class) {
            $paths[]='app/Services/Arcade/'.$class.'.php';
        }
        foreach(['resources/js/game/games/'.$game,'resources/js/game/input','resources/js/game/shared/collision',
            'resources/js/game/shared/navigation'] as $directory) {
            $full=base_path($directory);
            if (!is_dir($full) || is_link($full)) return [];
            foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($full,FilesystemIterator::SKIP_DOTS)) as $file) {
                if ($file->isLink()) return [];
                if ($file->isFile()) $paths[]=$directory.'/'.substr($file->getPathname(),strlen($full)+1);
            }
        }
        $hashes=[];
        foreach(array_unique($paths) as $path) {
            $full=base_path($path);
            if (!is_file($full)||!is_readable($full)||is_link($full)) return [];
            $sha=hash_file('sha256',$full);
            if (!is_string($sha)) return [];
            $hashes[$path]=$sha;
        }
        ksort($hashes,SORT_STRING);
        return $hashes;
    }

    public function evidenceValid(string $game, string $version, array $evidence, array $hashes, CarbonImmutable $now): bool
    {
        if (!isset(self::GAMES[$game]) || !in_array($version,[self::GAMES[$game]['legacy'],WeeklyContent::version($game)],true)
            || ($evidence['schema']??null)!==1 || ($evidence['policy']??null)!==self::POLICY
            || ($evidence['game_id']??null)!==$game || ($evidence['rules_version']??null)!==$version
            || ($evidence['scope']??null)!=='original-game' || ($evidence['status']??null)!=='approved'
            || ($evidence['risk']??null)!==self::GAMES[$game]['risk']
            || count($hashes)<25 || !is_array($evidence['source_hashes']??null) || !is_array($evidence['checks']??null)
            || !is_int($evidence['independent_pilot_participants']??null)||$evidence['independent_pilot_participants']<20
            || !is_string($evidence['reviewer']??null)||trim($evidence['reviewer'])===''
            || !is_string($evidence['evidence_reference']??null)||trim($evidence['evidence_reference'])==='') return false;
        $recorded=$evidence['source_hashes'];ksort($recorded,SORT_STRING);
        if ($recorded!==$hashes) return false;
        foreach($hashes as $sha) if (!is_string($sha)||!preg_match('/^[a-f0-9]{64}$/D',$sha)) return false;
        foreach(self::CHECKS as $check) if (($evidence['checks'][$check]??null)!==true) return false;
        foreach(['reviewed_on','eligible_from'] as $field) {
            if (!is_string($evidence[$field]??null)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$evidence[$field])) return false;
        }
        try {
            $review=CarbonImmutable::createFromFormat('!Y-m-d',$evidence['reviewed_on'],'Asia/Tehran');
            $from=CarbonImmutable::createFromFormat('!Y-m-d',$evidence['eligible_from'],'Asia/Tehran');
            $local=$now->setTimezone('Asia/Tehran');
            return $review && $from && $review->format('Y-m-d')===$evidence['reviewed_on']
                && $from->format('Y-m-d')===$evidence['eligible_from'] && $review->lte($local)
                && $local->lt($review->addDays(90)) && $from->isSaturday() && $from->gt($review)
                && $from->lte($local->startOfWeek(CarbonImmutable::SATURDAY));
        } catch (\Throwable) { return false; }
    }

    public function inspect(string $game,?string $version=null): array
    {
        $now=CarbonImmutable::now('UTC');
        $version??=$this->currentVersion($game,$now);
        $checks=['requested'=>$this->requested($game),'original_scope'=>$this->originalScope($game),
            'anticheat'=>app(ArcadeAntiCheat::class)->enabled(),
            'identity'=>app(PhoneIdentityService::class)->required()&&app(PhoneIdentityService::class)->ready(),
            'settlement'=>config('demian-arcade.weekly_settlement_enabled')===true,
            'coupon_policy'=>config('demian-coupons.policy_approved')===true&&config('demian-coupons.campaigns_enabled')===true
                &&config('demian-coupons.issue_enabled')===true&&config('demian-coupons.cafe_enabled')===true,
            'legal'=>config('demian-legal.publication_approved')===true&&config('demian-legal.require_acceptance')===true,
            'budget'=>false,'version_bound_manual_acceptance'=>false];
        try {
            $checks['budget']=app(CampaignEconomics::class)->required()&&app(CampaignEconomics::class)->ceiling()>0
                &&app(WeeklyAllocationService::class)->required();
            if (isset(self::GAMES[$game]) && is_string($version)) {
                $path=resource_path('game/prize-acceptance/'.$game.'.json');
                $evidence=is_file($path)?json_decode(file_get_contents($path),true,flags:JSON_THROW_ON_ERROR):[];
                $checks['version_bound_manual_acceptance']=is_array($evidence)
                    &&$this->evidenceValid($game,$version,$evidence,$this->sourceHashes($game),$now);
            }
        } catch (\Throwable) {}
        return ['game_id'=>$game,'policy'=>self::POLICY,'passed'=>!in_array(false,$checks,true),'checks'=>$checks];
    }

    public function approved(string $game,?string $version=null): bool
    {
        if (!$this->requested($game)||!$this->originalScope($game)) return false;
        if (!$this->required($game)) return true; // Existing legacy test fixtures only.
        return $this->inspect($game,$version)['passed'];
    }
}
