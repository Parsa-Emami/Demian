<?php

namespace Tests\Stress;

use App\Services\Arcade\WeeklyCompetitionService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Two independent MySQL/InnoDB connections race to lock the same game/week to
 * different scoring versions. Exactly one may win; no duplicated periods or
 * rules rows. This test is intentionally not simulated on SQLite.
 */
final class WeeklyCompetitionRuleRaceTest extends TestCase
{
    use DatabaseMigrations;

    public function test_two_mysql_processes_cannot_create_conflicting_weekly_rules(): void
    {
        if (DB::getDriverName() !== 'mysql' || ! function_exists('pcntl_fork')) {
            $this->markTestSkipped('Requires distinct MySQL/InnoDB worker processes.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-15T12:00:00Z'));
        config()->set('demian-arcade.weekly_start_cutoff_seconds', 30);
        DB::disconnect();
        $paths=[];$pids=[];
        try {
            foreach (['cafe-runner-v2','forged-next-week-v3'] as $index=>$version) {
                $path=sys_get_temp_dir().'/demian-week-rule-'.Str::uuid().'.json';
                $paths[]=$path;
                $pid=pcntl_fork();
                if($pid===-1)$this->fail('Unable to fork two MySQL season workers.');
                if($pid===0) {
                    DB::disconnect();
                    try {
                        usleep(10000);
                        DB::transaction(function () use ($version): void {
                            app(WeeklyCompetitionService::class)->authorizeNewRun(
                                now(),'dino-run',$version);
                        },5);
                        file_put_contents($path,json_encode([
                            'ok'=>true,'version'=>$version,
                        ],JSON_THROW_ON_ERROR));
                        exit(0);
                    } catch(HttpException $expected) {
                        file_put_contents($path,json_encode([
                            'ok'=>false,'status'=>$expected->getStatusCode(),
                            'version'=>$version,
                        ],JSON_THROW_ON_ERROR));
                        exit(0);
                    } catch(\Throwable $e) {
                        file_put_contents($path,json_encode([
                            'unexpected'=>get_class($e),'message'=>$e->getMessage(),
                        ],JSON_THROW_ON_ERROR));
                        exit(1);
                    }
                }
                $pids[]=$pid;
            }
            foreach($pids as $pid) {
                pcntl_waitpid($pid,$status);
                $this->assertTrue(pcntl_wifexited($status));
                $this->assertSame(0,pcntl_wexitstatus($status));
            }
            $results=[];
            foreach($paths as $path) {
                $this->assertFileExists($path);
                $results[]=json_decode(file_get_contents($path),true,
                    flags:JSON_THROW_ON_ERROR);
            }
            DB::reconnect();
            $this->assertCount(1,array_filter($results,
                static fn(array $result):bool=>($result['ok']??false)===true));
            $this->assertCount(1,array_filter($results,
                static fn(array $result):bool=>($result['status']??0)===409));
            $this->assertDatabaseCount('arcade_weekly_periods',1);
            $this->assertDatabaseCount('arcade_weekly_rule_locks',1);
            $this->assertDatabaseCount('arcade_weekly_lifecycle_events',1);
            $rule=DB::table('arcade_weekly_rule_locks')->first();
            $this->assertSame('dino-run',$rule->game_id);
            $this->assertContains($rule->rules_version,
                ['cafe-runner-v2','forged-next-week-v3']);
            $this->assertDatabaseCount('arcade_runs',0);
            $this->assertDatabaseCount('arcade_coupons',0);
        } finally {
            foreach($paths as $path) @unlink($path);
        }
    }
}
