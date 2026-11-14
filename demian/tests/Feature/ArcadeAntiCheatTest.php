<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeAntiCheat;
use App\Services\Arcade\RunnerReplayVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class ArcadeAntiCheatTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'ComplexPassword123!';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        config()->set('demian-arcade.anticheat.enabled', true);
        config()->set('demian-coupons.cafe_enabled', true);
    }

    private function player(): ArcadePlayer
    {
        $id=(string) Str::uuid();
        DB::table('arcade_players')->insert([
            'id'=>$id,'display_name'=>'Anti Cheat Player',
            'token_hash'=>hash('sha256',$id),
            'token_expires_at'=>now()->addDays(2),
            'created_at'=>now(),'updated_at'=>now(),
        ]);
        return ArcadePlayer::query()->findOrFail($id);
    }

    private function newRun(ArcadePlayer $player, string $status = 'started',
        string $game = 'dino-run', int $score = 0, ?string $replayHash = null): ArcadeRun
    {
        return ArcadeRun::query()->create([
            'player_id'=>$player->id,'request_id'=>(string) Str::uuid(),
            'game_id'=>$game,'rules_version'=>'anticheat-test-version',
            'character_slug'=>'darya','seed'=>7,'track_width'=>420,
            'status'=>$status,'score'=>$score,'ticks'=>1000,'passed'=>1,
            'replay_hash'=>$replayHash,
            'started_at'=>now()->subMinutes(1),
            'expires_at'=>now()->addMinutes(5),
            'completed_at'=>$status==='verified' ? now() : null,
        ]);
    }

    private function staff(string $role): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username'=>'staff'.Str::lower(Str::random(10)),
            'display_name'=>'Security Reviewer','password_hash'=>Hash::make(self::PASSWORD),
            'branch_id'=>'cafe-main','role'=>$role,'is_active'=>true,
            'session_version'=>1,'created_at'=>now(),'updated_at'=>now(),
        ]);
    }

    private function asStaff(int $id): static
    {
        return $this->withSession([
            'cafe_staff_id'=>$id,'cafe_staff_version'=>1,
            'cafe_authenticated_at'=>now()->timestamp,
        ]);
    }

    private function flaggedPlayer(): array
    {
        $player=$this->player();$anti=app(ArcadeAntiCheat::class);
        for($i=0;$i<4;$i++) {
            $anti->rejected($player,null,422,'203.0.113.42');
        }
        $report=DB::table('arcade_cheat_reports')
            ->where('player_id', $player->id)->first();
        $this->assertNotNull($report);
        return [$player,$report];
    }

    public function test_disabled_mode_never_creates_telemetry_or_changes_scores(): void
    {
        config()->set('demian-arcade.anticheat.enabled', false);
        $player=$this->player();$run=$this->newRun($player);
        $anti=app(ArcadeAntiCheat::class);
        $anti->assertStartAllowed($player->id);
        $anti->started($run,'198.51.100.9');
        $anti->rejected($player,$run,422,'198.51.100.9');
        $anti->verified($run,130,'198.51.100.9');
        $this->assertDatabaseCount('arcade_cheat_reports',0);
        $this->assertDatabaseCount('arcade_anticheat_observations',0);
    }

    public function test_velocity_detection_is_deduplicated_and_never_automatically_blocks_a_player(): void
    {
        $player=$this->player();
        $anti=app(ArcadeAntiCheat::class);
        for($i=0;$i<12;$i++){
            $anti->started($this->newRun($player), '203.0.113.4');
        }
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'player_id'=>$player->id,'signal'=>'start_velocity',
            'severity'=>'medium','status'=>'open',
        ]);
        $this->assertDatabaseCount('arcade_cheat_reports',1);
        $this->assertDatabaseCount('arcade_anticheat_observations',12);
        $this->assertGreaterThan(1,(int) DB::table('arcade_cheat_reports')
            ->value('hits'));
        $anti->assertStartAllowed($player->id);
        $this->assertSame(0, DB::table('arcade_anticheat_holds')->count());
        $digest=DB::table('arcade_anticheat_observations')->value('ip_digest');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/',$digest);
        $this->assertNotSame('203.0.113.4',$digest);
        $this->assertStringNotContainsString('203.0.113.4',
            json_encode(DB::table('arcade_anticheat_observations')->first()));
    }

    public function test_shared_cafe_network_is_a_review_signal_not_a_multiaccount_ban(): void
    {
        $anti=app(ArcadeAntiCheat::class);
        $players=[];
        for($i=0;$i<12;$i++){
            $p=$this->player();$players[]=$p;
            $anti->started($this->newRun($p),'2001:db8::9');
        }
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'signal'=>'shared_network_cohort','status'=>'open',
        ]);
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
        $anti->assertStartAllowed($players[0]->id);
    }

    public function test_repeated_invalid_proofs_are_reviewed_not_automatically_invalidated(): void
    {
        [$player,$report]=$this->flaggedPlayer();
        $this->assertSame('invalid_replay_velocity',$report->signal);
        $this->assertSame('high',$report->severity);
        $this->assertSame(4,
            DB::table('arcade_anticheat_observations')->count());
        $this->assertSame('open',$report->status);
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
        $anti=app(ArcadeAntiCheat::class);
        $anti->rejected($player,null,404,'203.0.113.42');
        $this->assertDatabaseCount('arcade_anticheat_observations',4);
        $anti->rejected($player,null,422,'203.0.113.42');
        $this->assertDatabaseCount('arcade_cheat_reports',1);
        $this->assertSame(2,(int)DB::table('arcade_cheat_reports')->value('hits'));
    }

    public function test_verification_detects_clone_across_accounts_and_score_outlier_without_mutation(): void
    {
        $anti=app(ArcadeAntiCheat::class);
        for($i=0;$i<20;$i++){
            $owner=$this->player();
            $this->newRun($owner,'verified','cafe-rush',100,
                $i===0 ? str_repeat('f',64) : hash('sha256','score-history-'.$i));
        }
        $suspect=$this->player();
        $target=$this->newRun($suspect,'verified','cafe-rush',2200,str_repeat('f',64));
        $anti->verified($target,985,'198.51.100.7');
        $signals=DB::table('arcade_cheat_reports')
            ->where('player_id',$suspect->id)->pluck('signal')->all();
        $this->assertContains('cross_account_replay',$signals);
        $this->assertContains('statistical_score_outlier',$signals);
        $this->assertContains('dense_control_trace',$signals);
        $this->assertDatabaseHas('arcade_runs',[
            'id'=>$target->id,'status'=>'verified','score'=>2200,
        ]);
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
        $this->assertSame(0,DB::table('arcade_coupons')->count());
        $outlier=DB::table('arcade_cheat_reports')
            ->where('signal','statistical_score_outlier')->first();
        $evidence=json_decode($outlier->evidence,true);
        $this->assertSame(20,$evidence['sample_size']);
        $this->assertSame(100,$evidence['baseline_median']);
    }

    public function test_only_stepup_superadmin_can_review_confirm_and_temporarily_hold_new_starts(): void
    {
        [$player,$report]=$this->flaggedPlayer();
        $admin=$this->staff('admin');$root=$this->staff('super_admin');
        $this->asStaff($admin)->get(route('cashier.anticheat'))->assertForbidden();
        $this->asStaff($admin)->post(route('cashier.anticheat.review'),[
            'report_id'=>$report->id,'decision'=>'confirmed',
            'note'=>'Manual confirmed replay manipulation',
            'password'=>self::PASSWORD,'confirmed'=>'1',
        ])->assertForbidden();
        $this->asStaff($root)->get(route('cashier.anticheat'))->assertOk()
            ->assertSee('پایش ضدتقلب')->assertSee($report->signal);
        $this->post(route('cashier.anticheat.review'),[
            'report_id'=>$report->id,'decision'=>'confirmed',
            'note'=>'Manual confirmed replay manipulation',
            'password'=>'incorrect','confirmed'=>'1',
        ])->assertForbidden();
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'id'=>$report->id,'status'=>'open',
        ]);
        $this->post(route('cashier.anticheat.review'),[
            'report_id'=>$report->id,'decision'=>'investigating',
            'note'=>'Examining the submitted replay pattern',
            'password'=>self::PASSWORD,'confirmed'=>'1',
        ])->assertRedirect(route('cashier.anticheat'));
        $this->post(route('cashier.anticheat.review'),[
            'report_id'=>$report->id,'decision'=>'confirmed',
            'note'=>'Manual confirmation with independent evidence',
            'password'=>self::PASSWORD,'confirmed'=>'1',
        ])->assertRedirect(route('cashier.anticheat'));
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'id'=>$report->id,'status'=>'confirmed','reviewed_by'=>$root,
        ]);
        $this->assertDatabaseCount('arcade_cheat_review_events',2);
        // Management write throttles are intentionally strict: after one
        // failed step-up and two reviewed writes, the next minute starts.
        $this->travel(61)->seconds();

        $this->post(route('cashier.anticheat.hold'),[
            'report_id'=>$report->id,'operation'=>'apply','hours'=>24,
            'note'=>'Temporary start restriction after review',
            'password'=>self::PASSWORD,'confirmed'=>'1',
        ])->assertRedirect(route('cashier.anticheat'));
        $this->assertDatabaseHas('arcade_anticheat_holds',[
            'player_id'=>$player->id,'report_id'=>$report->id,'actor_id'=>$root,
        ]);
        $this->assertDatabaseCount('arcade_cheat_review_events',3);
        try {
            app(ArcadeAntiCheat::class)->assertStartAllowed($player->id);
            $this->fail('A human-confirmed hold failed to block new runs.');
        } catch (HttpException $expected) {
            $this->assertSame(423,$expected->getStatusCode());
        }

        // Another privileged decision can be overturned with an audit record.
        $this->post(route('cashier.anticheat.review'),[
            'report_id'=>$report->id,'decision'=>'reopen',
            'note'=>'New evidence requires a second investigation',
            'password'=>self::PASSWORD,'confirmed'=>'1',
        ])->assertRedirect(route('cashier.anticheat'));
        $this->post(route('cashier.anticheat.hold'),[
            'report_id'=>$report->id,'operation'=>'release',
            'note'=>'Removing restriction after evidence review',
            'password'=>self::PASSWORD,'confirmed'=>'1',
        ])->assertRedirect(route('cashier.anticheat'));
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
        app(ArcadeAntiCheat::class)->assertStartAllowed($player->id);
        $this->assertDatabaseCount('arcade_cheat_review_events',5);
    }

    public function test_false_positive_review_stays_closed_even_if_signal_recurs(): void
    {
        [$player,$report]=$this->flaggedPlayer();
        $root=$this->staff('super_admin');
        app(ArcadeAntiCheat::class)->review($report->id,$root,1,
            'cleared','Shared device in the cafe, no evidence');
        app(ArcadeAntiCheat::class)->rejected($player,null,422,'203.0.113.42');
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'id'=>$report->id,'status'=>'cleared',
        ]);
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
    }

    public function test_retention_prunes_only_short_lived_observations_and_expired_holds(): void
    {
        [$player,$report]=$this->flaggedPlayer();
        $root=$this->staff('super_admin');
        $anti=app(ArcadeAntiCheat::class);
        $anti->review($report->id,$root,1,'confirmed',
            'Reviewed and confirmed signal from server evidence');
        $anti->setHold($report->id,$root,1,1,
            'Apply one-hour restriction with review');
        DB::table('arcade_anticheat_observations')
            ->update(['created_at'=>now()->subDays(35)]);
        $this->travel(2)->hours();
        $clean=$anti->prune();
        $this->assertSame(4,$clean['observations']);
        $this->assertSame(1,$clean['expired_holds']);
        $this->assertDatabaseCount('arcade_anticheat_observations',0);
        $this->assertDatabaseCount('arcade_cheat_reports',1);
        $this->assertDatabaseCount('arcade_cheat_review_events',2);
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
        $this->artisan('arcade:anticheat:prune',['--json'=>true])
            ->assertSuccessful();
        $this->artisan('arcade:anticheat:monitor',['--json'=>true,
            '--max-high'=>1])->assertSuccessful();
    }

    public function test_reports_respect_account_erasure_and_do_not_keep_player_secrets(): void
    {
        [$player,$report]=$this->flaggedPlayer();
        $this->assertStringNotContainsString('203.0.113.42',
            json_encode(DB::table('arcade_cheat_reports')->first()));
        $this->assertStringNotContainsString('203.0.113.42',
            json_encode(DB::table('arcade_anticheat_observations')->first()));
        $player->delete();
        $this->assertDatabaseCount('arcade_cheat_reports',0);
        $this->assertDatabaseCount('arcade_anticheat_observations',0);
    }

    public function test_monitor_exposes_only_aggregates_and_flags_review_backlog(): void
    {
        $this->flaggedPlayer();
        $metrics=app(ArcadeAntiCheat::class)->dashboard();
        $this->assertSame(1,$metrics['unresolved']);
        $this->assertSame(1,$metrics['high_priority']);
        $this->assertSame(4,$metrics['rejections_24h']);
        $this->assertArrayNotHasKey('player_id',$metrics);
        $this->artisan('arcade:anticheat:monitor',[
            '--json'=>true,'--max-high'=>1,
        ])->assertFailed();
    }
    public function test_manual_hold_cannot_be_released_or_reassigned_using_a_different_case(): void
    {
        [$player,$first]=$this->flaggedPlayer();
        $reviewer=$this->staff('super_admin');
        $anti=app(ArcadeAntiCheat::class);
        $anti->review($first->id,$reviewer,1,'confirmed',
            'Independent original replay evidence checked');
        for($i=0;$i<10;$i++) {
            $anti->started($this->newRun($player),'192.0.2.123');
        }
        $second=DB::table('arcade_cheat_reports')->where('signal','start_velocity')
            ->first();
        $this->assertNotNull($second);
        $anti->review($second->id,$reviewer,1,'confirmed',
            'Reviewed separate high-velocity start behavior');
        $anti->setHold($first->id,$reviewer,1,24,
            'Temporary restriction tied to the first case');
        foreach([null,24] as $duration){
            try {
                $anti->setHold($second->id,$reviewer,1,$duration,
                    'Wrong case cannot override the existing manual hold');
                $this->fail('A different report changed the existing case hold.');
            }catch(HttpException $expected){
                $this->assertSame(409,$expected->getStatusCode());
            }
        }
        $this->assertDatabaseHas('arcade_anticheat_holds',[
            'player_id'=>$player->id,'report_id'=>$first->id,
        ]);
        $anti->setHold($first->id,$reviewer,1,null,
            'Release after verifying the case owner and evidence');
        $this->assertDatabaseCount('arcade_anticheat_holds',0);
    }

    public function test_expired_resolved_cases_are_purged_but_active_investigations_are_retained(): void
    {
        [$clearedPlayer,$cleared]=$this->flaggedPlayer();
        $root=$this->staff('super_admin');
        $anti=app(ArcadeAntiCheat::class);
        $anti->review($cleared->id,$root,1,'cleared',
            'Client timezone mismatch confirmed as false positive');
        DB::table('arcade_cheat_reports')->where('id',$cleared->id)->update([
            'last_seen'=>now()->subDays(370),
        ]);
        [$openPlayer,$open]=$this->flaggedPlayer();
        DB::table('arcade_cheat_reports')->where('id',$open->id)->update([
            'last_seen'=>now()->subDays(370),
        ]);
        $this->assertDatabaseCount('arcade_cheat_reports',2);
        $result=$anti->prune();
        $this->assertSame(1,$result['resolved_reports']);
        $this->assertDatabaseMissing('arcade_cheat_reports',['id'=>$cleared->id]);
        $this->assertDatabaseHas('arcade_cheat_reports',[
            'id'=>$open->id,'status'=>'open',
        ]);
        $this->assertDatabaseCount('arcade_cheat_review_events',0);
    }

}
