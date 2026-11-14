<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeCrittersReplayVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ArcadeAntiCheatApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-arcade.anticheat.enabled',true);
        config()->set('demian-arcade.critters_ranked_enabled',true);
    }

    private function player(): array
    {
        return $this->postJson('/api/v1/arcade/players',[
            'display_name'=>'Ranked Arcade Reviewer',
        ])->assertCreated()->json();
    }

    public function test_real_authenticated_start_is_observed_once_when_retried_with_same_request_id(): void
    {
        $player=$this->player();
        $body=[
            'game_id'=>'cafe-critters',
            'request_id'=>(string)Str::uuid(),
            'rules_version'=>CafeCrittersReplayVerifier::VERSION,
        ];
        $first=$this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs',$body)->assertCreated()->json();
        $second=$this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs',$body)->assertCreated()->json();
        $this->assertSame($first['run_id'],$second['run_id']);
        $this->assertDatabaseCount('arcade_runs',1);
        $this->assertDatabaseCount('arcade_anticheat_observations',1);
        $this->assertDatabaseHas('arcade_anticheat_observations',[
            'player_id'=>$player['player_id'],
            'run_id'=>$first['run_id'],'event_code'=>'start',
        ]);
        $this->assertDatabaseCount('arcade_cheat_reports',0);
    }

    public function test_four_invalid_authenticated_replays_create_one_reviewable_report_without_score_mutation(): void
    {
        $player=$this->player();
        $run=$this->withToken($player['token'])->postJson(
            '/api/v1/arcade/turn-runs',[
                'game_id'=>'cafe-critters',
                'request_id'=>(string)Str::uuid(),
                'rules_version'=>CafeCrittersReplayVerifier::VERSION,
            ])->assertCreated()->json();
        $endpoint='/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $badProof=['ticks'=>1,
            'actions'=>[['tick'=>0,'kind'=>'award-fake-prize']]];
        for($i=0;$i<4;$i++){
            $this->withToken($player['token'])
                ->postJson($endpoint,$badProof)->assertUnprocessable();
        }
        $this->assertDatabaseCount('arcade_anticheat_observations',5);
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'player_id'=>$player['player_id'],
            'signal'=>'invalid_replay_velocity','status'=>'open',
        ]);
        $this->assertDatabaseHas('arcade_runs',[
            'id'=>$run['run_id'],'status'=>'started','score'=>0,
        ]);
        $this->assertDatabaseCount('arcade_replays',0);
        $this->assertDatabaseCount('arcade_leaderboard_entries',0);
        $this->assertDatabaseCount('arcade_coupons',0);
        $report=DB::table('arcade_cheat_reports')->first();
        $this->assertStringNotContainsString('award-fake-prize',$report->evidence);
        $this->assertStringNotContainsString($player['token'],$report->evidence);
    }

    public function test_untrusted_player_token_cannot_use_staff_review_or_monitoring_routes(): void
    {
        $player=$this->player();
        $this->withToken($player['token'])
            ->getJson('/cashier/admin/anti-cheat')->assertRedirect('/cashier/login');
        $this->withToken($player['token'])
            ->postJson('/cashier/admin/anti-cheat/review',[
                'report_id'=>1,'decision'=>'confirmed',
                'note'=>'Attempted to change a private report',
            ])->assertRedirect('/cashier/login');
        $this->assertDatabaseCount('arcade_cheat_review_events',0);
    }
}
