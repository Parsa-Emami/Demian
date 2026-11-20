<?php

namespace Tests\Feature;

use App\Services\Arcade\MultiGamePrizeReadiness as Gate;
use App\Services\Arcade\RankedGameCatalog;
use App\Services\Arcade\WeeklyCompetitionService;
use Carbon\CarbonImmutable;
use Domain\Arcade\WeeklyContent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class MultiGamePrizeReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_pending_independent_gates_keep_ranked_original_games_nonfinancial(): void
    {
        config()->set('demian-arcade.multi_game_acceptance_required',true);
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $gate=app(Gate::class);$catalog=app(RankedGameCatalog::class);
        $player=$this->postJson('/api/v1/arcade/players',['display_name'=>'Phase 14 QA'])->assertCreated()->json();
        foreach(Gate::GAMES as $game=>$definition) {
            config()->set('demian-arcade.'.$definition['flag'],true);
            if ($game==='cafe-critters') config()->set('demian-arcade.critters_ranked_enabled',true);
            elseif ($game==='coffee-crash') config()->set('demian-arcade.coffee_ranked_enabled',true);
            else config()->set('demian-arcade.gameplay_ranked_enabled.'.$game,true);
            $this->assertTrue($catalog->supportsRanked($game));
            $this->assertFalse($catalog->supportsPrizes($game));
            $this->assertTrue($catalog->requiresPrizeLock($game));
            $this->assertGreaterThan(25,count($gate->sourceHashes($game)));
            $this->assertFalse($gate->inspect($game)['checks']['version_bound_manual_acceptance']);
            $version=WeeklyContent::version($game);
            $this->withToken($player['token'])->postJson('/api/v1/arcade/turn-runs',[
                'game_id'=>$game,'rules_version'=>$version,'request_id'=>(string)Str::uuid(),
            ])->assertCreated();
            $lock=DB::table('arcade_weekly_rule_locks')->where('game_id',$game)->first();
            $this->assertNotNull($lock);
            $this->assertFalse((bool)$lock->prize_eligible);
            $this->assertFalse($catalog->prizeEligibleForLock($game,$lock,$version));
            $this->assertFalse($catalog->prizeEligibleForLock($game,null,$version));
        }
        $this->assertDatabaseCount('arcade_coupons',0);
    }

    public function test_route_trials_never_inherit_original_game_financial_eligibility(): void
    {
        $catalog=app(RankedGameCatalog::class);
        foreach(['after-hours','cafe-rush','open-world'] as $game) {
            config()->set('demian-arcade.route_ranked_enabled.'.$game,true);
            config()->set('demian-arcade.route_prizes_enabled.'.$game,true);
            config()->set('demian-arcade.gameplay_ranked_enabled.'.$game,false);
            $this->assertTrue($catalog->supportsRanked($game));
            $this->assertFalse($catalog->supportsPrizes($game));
            $this->assertFalse(app(Gate::class)->originalScope($game));
        }
        config()->set('demian-arcade.after_hours_prizes_enabled',true);
        config()->set('demian-arcade.cafe_rush_prizes_enabled',true);
        foreach(['after-hours','cafe-rush'] as $game) {
            $this->assertFalse($catalog->supportsPrizes($game));
            config()->set('demian-arcade.gameplay_ranked_enabled.'.$game,true);
            // Conflicting original and route flag is not commercially accepted.
            $this->assertFalse(app(Gate::class)->originalScope($game));
        }
        $this->assertFalse($catalog->supportsPrizes('open-world'));
    }

    public function test_evidence_is_game_version_scope_time_and_source_bound(): void
    {
        $gate=app(Gate::class);$game='cafe-critters';$version=WeeklyContent::version($game);
        $hashes=$gate->sourceHashes($game);
        $this->assertGreaterThan(25,count($hashes));
        $e=['schema'=>1,'policy'=>Gate::POLICY,'game_id'=>$game,'rules_version'=>$version,'scope'=>'original-game',
            'risk'=>Gate::GAMES[$game]['risk'],'status'=>'approved','reviewed_on'=>'2026-11-20','eligible_from'=>'2026-11-21',
            'reviewer'=>'test only','evidence_reference'=>'fixture only','independent_pilot_participants'=>20,
            'source_hashes'=>$hashes,'checks'=>array_fill_keys(Gate::CHECKS,true)];
        $now=CarbonImmutable::parse('2026-11-21T12:00:00Z');
        $this->assertTrue($gate->evidenceValid($game,$version,$e,$hashes,$now,'weekly:tehran:2026-11-21'));
        $this->assertFalse($gate->evidenceValid($game,$version,$e,$hashes,$now,'weekly:tehran:2026-11-14'));
        $this->assertFalse($gate->evidenceValid($game,Gate::GAMES[$game]['legacy'],$e,$hashes,$now));
        $this->assertFalse($gate->evidenceValid('coffee-crash',WeeklyContent::version('coffee-crash'),$e,$hashes,$now));
        $this->assertFalse($gate->evidenceValid('open-world',WeeklyContent::version('open-world'),$e,$hashes,$now));
        $this->assertFalse($gate->evidenceValid($game,$version,[...$e,'scope'=>'route-trial'],$hashes,$now));
        $this->assertFalse($gate->evidenceValid($game,$version,[...$e,'checks'=>[...$e['checks'],'game_specific_automation_risk'=>false]],$hashes,$now));
        $this->assertFalse($gate->evidenceValid($game,$version,[...$e,'independent_pilot_participants'=>19],$hashes,$now));
        $this->assertFalse($gate->evidenceValid($game,$version,$e,$hashes,$now->addDays(90)));
        $hashes[array_key_first($hashes)]=str_repeat('0',64);
        $this->assertFalse($gate->evidenceValid($game,$version,$e,$hashes,$now));
    }
}
