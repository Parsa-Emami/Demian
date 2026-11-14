<?php

namespace Tests\Stress;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeTurnRunService;
use App\Services\Arcade\CafeRushFrameReplayVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * True multi-process InnoDB replay-finalization race test.
 *
 * SQLite cannot verify row-lock concurrency. On MySQL with pcntl, two
 * independent PHP processes open separate PDO connections and attempt to
 * complete the SAME run. Exactly one replay/three leaderboard entries may
 * exist; both must observe the same immutable score.
 */
final class OriginalGameplayConcurrentCompletionTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_independent_mysql_workers_cannot_double_post_gameplay_score(): void
    {
        if (DB::getDriverName() !== 'mysql' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Real InnoDB concurrency requires MySQL and pcntl.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        config()->set('demian-arcade.gameplay_ranked_enabled.cafe-rush',true);

        $node=new Process(['node',base_path('tools/generate_rush_gameplay_fixture.mjs'),
            '7','standard']);
        $node->setTimeout(70);$node->mustRun();
        $fixture=json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
        $this->assertGreaterThan(0,$fixture['original_js']['delivered']);
        $registered=$this->postJson('/api/v1/arcade/players',[
            'display_name'=>'MySQL Replay Race',
        ])->assertCreated()->json();
        $start=$this->withToken($registered['token'])
            ->postJson('/api/v1/arcade/turn-runs',[
                'request_id'=>(string)Str::uuid(),
                'game_id'=>'cafe-rush',
                'rules_version'=>CafeRushFrameReplayVerifier::VERSION,
            ])->assertCreated()->json();

        $runId=$start['run_id'];$playerId=$registered['player_id'];
        DB::table('arcade_runs')->where('id',$runId)->update([
            'seed'=>7,
            'started_at'=>now()->subSeconds(121),
            'expires_at'=>now()->addSeconds(300),
        ]);
        $proof=['ticks'=>7200,'frames'=>$fixture['transitions']];
        DB::disconnect();

        $tmp=sys_get_temp_dir().'/demian-race-'.Str::uuid();
        $pids=[];$paths=[];
        try {
            for($i=0;$i<2;$i++){
                $target=$tmp.'-'.$i.'.json';
                $paths[]=$target;
                $pid=pcntl_fork();
                if($pid===-1)$this->fail('Cannot start independent MySQL worker.');
                if($pid===0){
                    // Child must NOT reuse the parent PDO handle after fork.
                    DB::disconnect();
                    try{
                        usleep(10000);
                        $result=app(ArcadeTurnRunService::class)->complete(
                            ArcadePlayer::query()->findOrFail($playerId),
                            ArcadeRun::query()->findOrFail($runId),$proof);
                        file_put_contents($target,json_encode([
                            'status'=>$result['status'],'score'=>$result['score'],
                        ],JSON_THROW_ON_ERROR));
                        exit(0);
                    }catch(\Throwable $e){
                        file_put_contents($target,json_encode([
                            'error'=>get_class($e),'message'=>$e->getMessage(),
                        ],JSON_THROW_ON_ERROR));
                        exit(1);
                    }
                }
                $pids[]=$pid;
            }
            foreach($pids as $pid){
                pcntl_waitpid($pid,$status);
                $this->assertSame(0,pcntl_wexitstatus($status),
                    'Independent completion worker failed.');
            }
            foreach($paths as $path){
                $this->assertFileExists($path);
                $row=json_decode(file_get_contents($path),true,flags:JSON_THROW_ON_ERROR);
                $this->assertSame('verified',$row['status']??null);
                $this->assertSame($fixture['original_js']['score'],$row['score']);
            }
            DB::reconnect();
            $this->assertDatabaseCount('arcade_replays',1);
            $this->assertDatabaseCount('arcade_leaderboard_entries',3);
            $this->assertDatabaseHas('arcade_runs',[
                'id'=>$runId,'status'=>'verified',
                'score'=>$fixture['original_js']['score'],
            ]);
        }finally{
            foreach($paths as $path)@unlink($path);
        }
    }
}
