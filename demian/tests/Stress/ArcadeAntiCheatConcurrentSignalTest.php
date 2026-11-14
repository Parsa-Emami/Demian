<?php

namespace Tests\Stress;

use App\Models\ArcadePlayer;
use App\Services\Arcade\ArcadeAntiCheat;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * MySQL/InnoDB dual-process race. No nested SQLite in-memory connections:
 * a duplicated heuristic must open ONE fingerprint report, not two.
 */
final class ArcadeAntiCheatConcurrentSignalTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_mysql_workers_deduplicate_the_same_suspicious_replay_signal(): void
    {
        if (DB::getDriverName() !== 'mysql' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires two independent MySQL worker processes.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        config()->set('demian-arcade.anticheat.enabled', true);
        config()->set('demian-arcade.anticheat.rejection_burst_count', 1);
        $id=(string) Str::uuid();
        DB::table('arcade_players')->insert([
            'id'=>$id,'display_name'=>'Concurrent Suspicious Player',
            'token_hash'=>hash('sha256',$id),
            'token_expires_at'=>now()->addDay(),
            'created_at'=>now(),'updated_at'=>now(),
        ]);
        DB::disconnect();
        $paths=[];$pids=[];
        try {
            for($i=0;$i<2;$i++){
                $path=sys_get_temp_dir().'/demian-step10-'.Str::uuid().'.json';
                $paths[]=$path;
                $pid=pcntl_fork();
                if ($pid===-1) $this->fail('Could not fork two InnoDB workers.');
                if ($pid===0) {
                    DB::disconnect();
                    try {
                        $player=ArcadePlayer::query()->findOrFail($id);
                        app(ArcadeAntiCheat::class)->rejected($player,null,422,'203.0.113.6');
                        file_put_contents($path,'{"ok":true}');
                        exit(0);
                    } catch (\Throwable $error) {
                        file_put_contents($path,json_encode([
                            'error'=>get_class($error), 'message'=>$error->getMessage(),
                        ]));
                        exit(1);
                    }
                }
                $pids[]=$pid;
            }
            foreach($pids as $pid){
                pcntl_waitpid($pid,$status);
                $this->assertSame(0,pcntl_wexitstatus($status),
                    'Concurrent report writer failed.');
            }
            foreach($paths as $path){
                $this->assertFileExists($path);
                $this->assertSame('{"ok":true}',file_get_contents($path));
            }
            DB::reconnect();
            $this->assertDatabaseCount('arcade_anticheat_observations',2);
            $this->assertDatabaseCount('arcade_cheat_reports',1);
            $report=DB::table('arcade_cheat_reports')->first();
            $this->assertSame('invalid_replay_velocity',$report->signal);
            $this->assertSame(2,(int)$report->hits);
            $this->assertSame('open',$report->status);
            $this->assertDatabaseCount('arcade_anticheat_holds',0);
        } finally {
            foreach($paths as $path)@unlink($path);
        }
    }
}
