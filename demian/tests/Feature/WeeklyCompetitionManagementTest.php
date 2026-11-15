<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\RunnerReplayVerifier;
use App\Services\Arcade\WeeklyCompetitionService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Acceptance suite for roadmap Phase 3 Step 11, not a replacement for
 * existing WeeklySettlementTest or immutable financial ledger tests.
 */
final class WeeklyCompetitionManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-arcade.weekly_start_cutoff_seconds', 30);
        config()->set('demian-arcade.weekly_completion_deadline_seconds', 900);
        config()->set('demian-arcade.weekly_management_enabled', false);
        config()->set('demian-arcade.anticheat.enabled', false);
    }

    private function account(): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Weekly Competition Tester',
        ])->assertCreated()->json();
    }

    private function startRun(array $account, ?string $requestId = null): array
    {
        return $this->withToken($account['token'])
            ->postJson('/api/v1/arcade/runs', [
                'request_id' => $requestId ?? (string) Str::uuid(),
                'game_id' => 'dino-run',
                'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'],
                'character_slug' => 'darya', 'track_width' => 420,
            ])->assertCreated()->json();
    }

    public function test_tehran_saturday_windows_are_utc_and_preparation_is_repeatable(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:00Z'));
        $service = app(WeeklyCompetitionService::class);
        $periods = $service->prepare();
        $this->assertCount(2, $periods);
        $this->assertSame('weekly:tehran:2026-11-07', $periods[0]['period_key']);
        $this->assertSame('active', $periods[0]['status']);
        $this->assertSame('2026-11-13T20:30:00+00:00', $periods[0]['ends_at']);
        $this->assertSame('2026-11-13T20:29:30+00:00', $periods[0]['new_starts_close_at']);
        $this->assertSame('2026-11-13T20:45:00+00:00', $periods[0]['completion_deadline_at']);
        $this->assertSame('weekly:tehran:2026-11-14', $periods[1]['period_key']);
        $this->assertSame('scheduled', $periods[1]['status']);
        $this->assertDatabaseCount('arcade_weekly_periods', 2);
        $this->assertDatabaseCount('arcade_weekly_lifecycle_events', 2);

        $this->assertSame($periods, $service->prepare());
        $this->assertDatabaseCount('arcade_weekly_lifecycle_events', 2);
        $public = $this->getJson('/api/v1/arcade/competition/weekly')
            ->assertOk()->assertJsonPath('current.status', 'active')
            ->assertJsonPath('next.status', 'scheduled')->json();
        $this->assertSame([], $public['current']['rules_versions']);
        $this->assertArrayNotHasKey('player_id', $public['current']);
        $this->assertArrayNotHasKey('coupon', $public['current']);

        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:30:00Z'));
        $service->ensure(CarbonImmutable::parse('2026-11-10T10:00:00Z'));
        $this->assertDatabaseHas('arcade_weekly_periods', [
            'period_key' => 'weekly:tehran:2026-11-07', 'lifecycle_status' => 'closing',
        ]);
        $this->assertDatabaseHas('arcade_weekly_lifecycle_events', [
            'period_key' => 'weekly:tehran:2026-11-07', 'state' => 'closing',
        ]);
        $this->assertSame('active', $service->publicSchedule()['current']['status']);
        $this->assertSame('sealed', app(WeeklySettlementService::class)
            ->seal('2026-11-07')['status']);
        $this->assertDatabaseHas('arcade_weekly_periods', [
            'period_key' => 'weekly:tehran:2026-11-07',
            'status' => 'sealed', 'lifecycle_status' => 'finalized',
        ]);
        $this->assertDatabaseHas('arcade_weekly_lifecycle_events', [
            'period_key' => 'weekly:tehran:2026-11-07', 'state' => 'finalized',
        ]);
        $this->assertSame('finalized', $service->describe(
            CarbonImmutable::parse('2026-11-10T10:00:00Z'))['status']);
    }

    public function test_start_cutoff_rejects_new_runs_but_idempotent_retry_keeps_existing_seed(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:29Z'));
        $account=$this->account();
        $requestId=(string) Str::uuid();
        $run=$this->startRun($account, $requestId);
        $this->assertDatabaseCount('arcade_runs',1);
        $this->assertDatabaseHas('arcade_weekly_rule_locks',[
            'period_key'=>'weekly:tehran:2026-11-07',
            'game_id'=>'dino-run','rules_version'=>app(RunnerReplayVerifier::class)->rules()['version'],
        ]);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:30Z'));
        $retry=$this->startRun($account, $requestId);
        $this->assertSame($run['run_id'],$retry['run_id']);
        $this->assertSame($run['seed'],$retry['seed']);
        $this->withToken($account['token'])
            ->postJson('/api/v1/arcade/runs',[
                'request_id'=>(string) Str::uuid(),
                'game_id'=>'dino-run',
                'rules_version'=>app(RunnerReplayVerifier::class)->rules()['version'],
                'character_slug'=>'darya','track_width'=>420,
            ])->assertConflict();
        $this->assertDatabaseCount('arcade_runs',1);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:30:00Z'));
        $next=$this->startRun($account);
        $this->assertNotSame($next['run_id'],$run['run_id']);
        $this->assertDatabaseCount('arcade_runs',2);
        $this->assertDatabaseCount('arcade_weekly_rule_locks',2);
    }

    public function test_scoring_rules_are_frozen_for_a_game_but_not_other_games_or_next_week(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10T10:00:00Z'));
        $service=app(WeeklyCompetitionService::class);
        DB::transaction(function () use ($service): void {
            $service->authorizeNewRun(now(), 'dino-run', 'cafe-runner-v2');
        });
        $this->assertDatabaseCount('arcade_weekly_rule_locks',1);
        try {
            DB::transaction(function () use ($service): void {
                $service->authorizeNewRun(now(), 'dino-run', 'changed-rules-v3');
            });
            $this->fail('Mid-week version mutation should not be possible.');
        } catch (HttpException $expected) {
            $this->assertSame(409,$expected->getStatusCode());
        }
        DB::transaction(function () use ($service): void {
            $service->authorizeNewRun(now(), 'cafe-critters', 'critters-replay-v1');
        });
        $this->assertDatabaseCount('arcade_weekly_rule_locks',2);
        $this->assertSame('cafe-runner-v2',
            $service->publicSchedule()['current']['rules_versions']['dino-run']);
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        DB::transaction(function () use ($service): void {
            $service->authorizeNewRun(now(), 'dino-run', 'changed-rules-v3');
        });
        $this->assertDatabaseHas('arcade_weekly_rule_locks',[
            'period_key'=>'weekly:tehran:2026-11-14',
            'game_id'=>'dino-run','rules_version'=>'changed-rules-v3',
        ]);
    }

    public function test_preexisting_historic_run_prevents_creating_incompatible_lock(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10T10:00:00Z'));
        $player=$this->account();
        $this->startRun($player);
        DB::table('arcade_weekly_rule_locks')->delete();
        $service=app(WeeklyCompetitionService::class);
        try {
            DB::transaction(fn() => $service->authorizeNewRun(
                now(), 'dino-run', 'forged-v7'));
            $this->fail('Pre-migration run history must freeze the scoring version.');
        } catch (HttpException $expected) {
            $this->assertSame(409,$expected->getStatusCode());
        }
        $this->assertDatabaseCount('arcade_weekly_rule_locks',0);
    }

    public function test_a_real_run_can_complete_after_utc_rollover_before_week_seals(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:00Z'));
        $person=$this->account();
        $run=$this->startRun($person);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:30:05Z'));
        $service=app(WeeklyCompetitionService::class);
        $service->authorizeCompletion(CarbonImmutable::parse('2026-11-13T20:29:00Z'));
        $this->assertSame('closing',$service->describe(
            CarbonImmutable::parse('2026-11-10T10:00:00Z'))['status']);
        try {
            app(WeeklySettlementService::class)->seal('2026-11-07');
            $this->fail('A valid in-flight run must block sealing.');
        } catch (\RuntimeException $expected) {
            $this->assertStringContainsString('in-flight', $expected->getMessage());
        }
        // Use a real source-generated deterministic replay, not a fabricated
        // high score. Only the test process may set the server seed.
        $fixture = json_decode(file_get_contents(base_path('tests/Fixtures/runner-replays.json')),
            true, flags: JSON_THROW_ON_ERROR)[0];
        DB::table('arcade_runs')->where('id',$run['run_id'])
            ->update(['seed'=>$fixture['seed']]);
        $done=$this->withToken($person['token'])->postJson(
            '/api/v1/arcade/runs/'.$run['run_id'].'/complete',[
                'ticks'=>$fixture['ticks'],
                'transitions'=>$fixture['transitions'],
            ])->assertOk()->json();
        $this->assertSame('verified',$done['status']);
        $this->assertSame($fixture['expected']['score'],$done['score']);
        $this->assertDatabaseHas('arcade_leaderboard_entries',[
            'period_key'=>'weekly:tehran:2026-11-07',
            'run_id'=>$run['run_id'],
        ]);
        $this->assertSame('sealed',app(WeeklySettlementService::class)
            ->seal('2026-11-07')['status']);
        $this->assertDatabaseCount('arcade_weekly_results',1);
        $this->assertDatabaseCount('arcade_weekly_winners',1);
        $this->assertSame('already_sealed',app(WeeklySettlementService::class)
            ->seal('2026-11-07')['status']);
    }

    public function test_submission_after_stored_deadline_is_rejected_even_if_run_claims_long_expiry(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:28:00Z'));
        $owner=$this->account();
        $run=$this->startRun($owner);
        $this->assertSame('2026-11-13 20:45:00',
            DB::table('arcade_weekly_periods')->value('completion_deadline_at'));
        // Simulate a corrupted or historical run whose expiration is too far
        // out. Period-level policy must still reject its completion.
        DB::table('arcade_runs')->where('id',$run['run_id'])
            ->update(['expires_at'=>'2026-11-14 00:00:00']);
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:45:01Z'));
        try {
            app(WeeklyCompetitionService::class)->authorizeCompletion(
                CarbonImmutable::parse('2026-11-13T20:28:00Z'));
            $this->fail('Competition accepted replay after final deadline.');
        } catch (HttpException $e) {
            $this->assertSame(410,$e->getStatusCode());
        }
        $this->withToken($owner['token'])
            ->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete',[
                'ticks'=>65,'transitions'=>[['tick'=>0,'mask'=>3],['tick'=>1,'mask'=>2]],
            ])->assertStatus(410);
        $this->assertDatabaseCount('arcade_replays',0);
        $this->assertDatabaseCount('arcade_weekly_results',0);
    }

    public function test_cutoff_and_completion_policy_never_change_for_a_prepared_week(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T15:00:00Z'));
        $service=app(WeeklyCompetitionService::class);
        $service->prepare();
        config()->set('demian-arcade.weekly_start_cutoff_seconds',300);
        config()->set('demian-arcade.weekly_completion_deadline_seconds',3600);
        $this->travelTo(CarbonImmutable::parse('2026-11-14T08:00:00Z'));
        $data=$service->publicSchedule()['current'];
        $this->assertSame('2026-11-20T20:29:30+00:00',$data['new_starts_close_at']);
        $this->assertSame('2026-11-20T20:45:00+00:00',$data['completion_deadline_at']);
        $this->assertDatabaseHas('arcade_weekly_periods',[
            'period_key'=>'weekly:tehran:2026-11-14','start_cutoff_seconds'=>30,
        ]);
    }

    public function test_operator_preparation_requires_apply_and_creates_no_prizes(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-15T12:00:00Z'));
        $this->artisan('arcade:prepare-weeks')->assertFailed();
        $this->assertDatabaseCount('arcade_weekly_periods',0);
        $this->artisan('arcade:prepare-weeks',['--apply'=>true,'--json'=>true])
            ->assertSuccessful();
        $this->assertDatabaseCount('arcade_weekly_periods',2);
        $this->assertDatabaseCount('arcade_weekly_results',0);
        $this->assertDatabaseCount('arcade_weekly_winners',0);
        $this->assertDatabaseCount('arcade_coupons',0);
    }
}
