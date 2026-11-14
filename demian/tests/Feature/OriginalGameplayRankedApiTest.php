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
    public function test_original_cafe_rush_completed_shift_is_verified_once_and_replay_mutation_is_rejected(): void
    {
        $node=new \Symfony\Component\Process\Process([
            'node',base_path('tools/generate_rush_gameplay_fixture.mjs'),'7','standard',
        ]);
        $node->setTimeout(70);
        $node->mustRun();
        $fixture=json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
        $this->assertGreaterThan(0,$fixture['original_js']['delivered']);

        config()->set('demian-arcade.gameplay_ranked_enabled.cafe-rush',true);
        $owner=$this->player();
        $run=$this->start($owner,'cafe-rush',CafeRushFrameReplayVerifier::VERSION,
            (string) Str::uuid());
        // CI fixture seed must equal the server-issued seed for an
        // independently versioned, deterministic rules test. Only tests can
        // modify this row; the public API NEVER accepts a client seed.
        DB::table('arcade_runs')->where('id',$run['run_id'])->update(['seed'=>7]);
        $this->travel(121)->seconds();
        $url='/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $proof=['ticks'=>7200,'frames'=>$fixture['transitions']];
        $first=$this->withToken($owner['token'])->postJson($url,
            [...$proof,'score'=>100000000])->assertOk()
            ->assertJsonPath('status','verified')
            ->assertJsonPath('verification','server-replay');
        $this->assertSame($fixture['original_js']['score'],$first->json('score'));
        $this->assertSame($fixture['original_js']['delivered'],$first->json('passed'));
        $this->assertSame($first->json('score'),
            $this->withToken($owner['token'])->postJson($url,$proof)->assertOk()->json('score'));

        $tampered=$proof;
        $tampered['frames'][1][1]=$tampered['frames'][1][1]===1?0.5:1;
        $this->withToken($owner['token'])->postJson($url,$tampered)->assertStatus(409);
        $this->assertDatabaseCount('arcade_replays',1);
        $this->assertDatabaseCount('arcade_leaderboard_entries',3);
        $this->assertDatabaseHas('arcade_runs',[
            'id'=>$run['run_id'],'status'=>'verified',
            'rules_version'=>CafeRushFrameReplayVerifier::VERSION,
            'score'=>$fixture['original_js']['score'],
        ]);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-rush')
            ->assertOk()->assertJsonPath('rules_version',CafeRushFrameReplayVerifier::VERSION)
            ->assertJsonPath('data.0.score',$fixture['original_js']['score']);
        $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes('cafe-rush'));
    }

    public function test_gameplay_replay_early_completion_is_rejected_before_scoring(): void
    {
        config()->set('demian-arcade.gameplay_ranked_enabled.cafe-rush',true);
        $owner=$this->player();
        $run=$this->start($owner,'cafe-rush',CafeRushFrameReplayVerifier::VERSION,
            (string)Str::uuid());
        $this->withToken($owner['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',[
                'ticks'=>7200,'frames'=>[[1,0,0,0,0],[7200,0,0,0,0]],
            ])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_replays',0);
    }

    public function test_original_game_finished_run_cannot_be_replayed_on_another_account(): void
    {
        config()->set('demian-arcade.gameplay_ranked_enabled.cafe-rush',true);
        $playerA=$this->player();
        $playerB=$this->player('Second User');
        $run=$this->start($playerA,'cafe-rush',CafeRushFrameReplayVerifier::VERSION,
            (string)Str::uuid());
        $this->travel(121)->seconds();
        $this->withToken($playerB['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',[
                'ticks'=>7200,'frames'=>[[1,0,0,0,0],[7200,0,0,0,0]],
            ])->assertNotFound();
        $this->assertDatabaseCount('arcade_leaderboard_entries',0);
    }

    public function test_original_after_hours_genuine_shadow_safe_escape_is_persisted_as_an_authoritative_score(): void
    {
        $node=new \Symfony\Component\Process\Process([
            'node',base_path('tools/generate_after_hours_winning_fixture.mjs'),
        ]);
        $node->setTimeout(90);
        $node->mustRun();
        $data=json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
        $this->assertNotNull($data['winner']);
        $fixture=$data['winner'];
        config()->set('demian-arcade.gameplay_ranked_enabled.after-hours',true);
        $owner=$this->player();
        $run=$this->start($owner,'after-hours',AfterHoursFrameReplayVerifier::VERSION,
            (string)Str::uuid());
        DB::table('arcade_runs')->where('id',$run['run_id'])->update([
            'seed'=>$fixture['seed'],
        ]);
        $this->travel((int)ceil($fixture['ticks']/60)+2)->seconds();
        $url='/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $proof=['ticks'=>$fixture['ticks'],'frames'=>$fixture['frames']];
        $this->withToken($owner['token'])->postJson($url,$proof)->assertOk()
            ->assertJsonPath('score',$fixture['score'])
            ->assertJsonPath('passed',2)
            ->assertJsonPath('status','verified')
            ->assertJsonPath('rules_version',AfterHoursFrameReplayVerifier::VERSION);
        $this->withToken($owner['token'])->postJson($url,$proof)->assertOk()
            ->assertJsonPath('score',$fixture['score']);
        $this->assertDatabaseCount('arcade_replays',1);
        $this->assertDatabaseCount('arcade_leaderboard_entries',3);
        $this->getJson('/api/v1/arcade/leaderboards/after-hours')
            ->assertOk()
            ->assertJsonPath('rules_version',AfterHoursFrameReplayVerifier::VERSION)
            ->assertJsonPath('data.0.score',$fixture['score']);
        $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes('after-hours'));
    }

}
