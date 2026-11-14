<?php

namespace Tests\Feature;

use App\Services\Arcade\AfterHoursFrameReplayVerifier;
use App\Services\Arcade\CafeRushFrameReplayVerifier;
use App\Services\Arcade\RankedGameCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class OriginalGameplayRankedApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T11:00:00Z'));
        foreach(['after-hours','cafe-rush'] as $game){
            config()->set('demian-arcade.gameplay_ranked_enabled.'.$game,false);
            config()->set('demian-arcade.route_ranked_enabled.'.$game,false);
            config()->set('demian-arcade.route_prizes_enabled.'.$game,true);
        }
    }

    private function player(string $name='Full Gameplay Competitor'): array
    {
        return $this->postJson('/api/v1/arcade/players',[
            'display_name'=>$name,
        ])->assertCreated()->json();
    }

    private function start(array $player,string $game,string $version,string $request): array
    {
        return $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs',[
                'request_id'=>$request,'game_id'=>$game,
                'rules_version'=>$version,
            ])->assertCreated()->json();
    }

    public function test_original_score_modes_are_fail_closed_when_rollout_flags_are_off(): void
    {
        $user=$this->player();
        foreach([
            'after-hours'=>AfterHoursFrameReplayVerifier::VERSION,
            'cafe-rush'=>CafeRushFrameReplayVerifier::VERSION,
        ] as $game=>$version){
            $this->withToken($user['token'])
                ->postJson('/api/v1/arcade/turn-runs',[
                    'request_id'=>(string)Str::uuid(),
                    'game_id'=>$game,'rules_version'=>$version,
                ])->assertStatus(503);
            $this->getJson('/api/v1/arcade/leaderboards/'.$game)->assertNotFound();
            $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes($game));
        }
        $this->assertDatabaseCount('arcade_runs',0);
    }

    public function test_gameplay_rules_are_immutable_and_exclusive_with_old_route_proofs(): void
    {
        $user=$this->player();
        foreach([
            'after-hours'=>AfterHoursFrameReplayVerifier::VERSION,
            'cafe-rush'=>CafeRushFrameReplayVerifier::VERSION,
        ] as $game=>$version){
            config()->set('demian-arcade.gameplay_ranked_enabled.'.$game,true);
            config()->set('demian-arcade.route_ranked_enabled.'.$game,true);
            $request=(string)Str::uuid();
            $run=$this->start($user,$game,$version,$request);
            $this->assertSame($version,$run['rules_version']);
            $this->assertSame($game,$run['game_id']);
            $this->assertNull($run['goals']);
            $this->assertGreaterThan(0,$run['seed']);
            $this->assertSame($run['run_id'],
                $this->start($user,$game,$version,$request)['run_id']);
            $this->withToken($user['token'])
                ->postJson('/api/v1/arcade/turn-runs',[
                    'request_id'=>(string)Str::uuid(),'game_id'=>$game,
                    'rules_version'=>$game.'-route-v1',
                ])->assertStatus(409);
            $catalog=collect(app(RankedGameCatalog::class)->publicList())
                ->firstWhere('game_id',$game);
            $this->assertSame('original-game',$catalog['ranked_scope']);
            $this->assertTrue($catalog['ranked']);
            $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes($game));
        }
        $this->assertDatabaseCount('arcade_runs',2);
    }

    public function test_server_rejects_fake_frames_and_cross_account_completions(): void
    {
        $owner=$this->player();
        $other=$this->player('Other Competition Account');
        config()->set('demian-arcade.gameplay_ranked_enabled.cafe-rush',true);
        $run=$this->start($owner,'cafe-rush',CafeRushFrameReplayVerifier::VERSION,
            (string)Str::uuid());
        $url='/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $invalid=['ticks'=>7200,'frames'=>[[1,0,0,0,0],[7200,0,0,0,0]]];
        $this->travel(121)->seconds();
        $this->withToken($other['token'])->postJson($url,$invalid)->assertNotFound();
        $this->withToken($owner['token'])
            ->postJson($url,['ticks'=>7200,'actions'=>[
                ['tick'=>0,'kind'=>'checkpoint','target'=>'free-prize']
            ]])->assertUnprocessable();
        $this->withToken($owner['token'])
            ->postJson($url,[...$invalid,'actions'=>[
                ['tick'=>0,'kind'=>'checkpoint','target'=>'free-prize']
            ]])->assertUnprocessable();
        $this->withToken($owner['token'])->postJson($url,$invalid)->assertUnprocessable();
        $this->assertDatabaseHas('arcade_runs',[
            'id'=>$run['run_id'],'status'=>'started',
        ]);
        $this->assertDatabaseCount('arcade_replays',0);
        $this->assertDatabaseCount('arcade_leaderboard_entries',0);
    }

    public function test_original_after_hours_cannot_claim_shadow_escape_from_idle_inputs(): void
    {
        config()->set('demian-arcade.gameplay_ranked_enabled.after-hours',true);
        $owner=$this->player();
        $run=$this->start($owner,'after-hours',AfterHoursFrameReplayVerifier::VERSION,
            (string)Str::uuid());
        $this->travel(61)->seconds();
        $this->withToken($owner['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',[
                'ticks'=>3600,
                'frames'=>[[1,0,0,0,0,null],[3600,0,0,0,0,null]],
            ])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_replays',0);
    }
}
