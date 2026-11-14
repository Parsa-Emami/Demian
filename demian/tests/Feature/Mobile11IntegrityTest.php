<?php

namespace Tests\Feature;

use App\Models\ArcadeRun;
use App\Services\Arcade\ArcadeIntegrityAudit;
use App\Services\Arcade\RunnerReplayVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class Mobile11IntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function verifiedRun(): array
    {
        $fixture = json_decode(file_get_contents(base_path('tests/Fixtures/runner-replays.json')),
            true, flags: JSON_THROW_ON_ERROR)[0];
        $player = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Integrity Player',
        ])->assertCreated()->json();
        $start = $this->withToken($player['token'])->postJson('/api/v1/arcade/runs', [
            'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run',
            'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'],
            'character_slug' => 'darya',
            'track_width' => $fixture['width'],
        ])->assertCreated()->json();
        ArcadeRun::query()->findOrFail($start['run_id'])->update([
            'seed' => $fixture['seed'],
            'started_at' => now()->subSeconds((int) ceil($fixture['ticks'] / 60) + 1),
        ]);
        $this->postJson('/api/v1/arcade/runs/'.$start['run_id'].'/complete', [
            'ticks' => $fixture['ticks'],
            'transitions' => $fixture['transitions'],
        ])->assertOk()->assertJsonPath('status', 'verified');

        return ['player' => $player, 'run' => $start];
    }

    public function test_readiness_checks_arcade_schema_and_hides_internal_details(): void
    {
        $this->getJson('/up')->assertOk();
        $this->getJson('/api/v1/arcade/health')->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonStructure(['release'])
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonMissingPath('database_password');
    }

    public function test_valid_verified_score_passes_read_only_integrity_audit(): void
    {
        $rows = $this->verifiedRun();
        $this->assertSame('ok', app(ArcadeIntegrityAudit::class)->inspect()['status']);
        $this->artisan('arcade:integrity', ['--json' => true])->assertSuccessful();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $verified = ArcadeRun::query()->findOrFail($rows['run']['run_id']);
        $this->withToken($rows['player']['token'])->getJson('/api/v1/arcade/player/best')
            ->assertOk()->assertJsonPath('best.score', $verified->score);
    }

    public function test_inconsistent_leaderboard_score_is_detected_without_mutation(): void
    {
        $this->verifiedRun();
        $prior = DB::table('arcade_leaderboard_entries')->first();
        DB::table('arcade_leaderboard_entries')->where('id', $prior->id)
            ->update(['score' => $prior->score + 12345]);
        $audit = app(ArcadeIntegrityAudit::class)->inspect();
        $this->assertSame('inconsistent', $audit['status']);
        $this->assertSame(1, $audit['checks']['broken_leaderboard_entries']);
        $this->artisan('arcade:integrity', ['--json' => true])->assertFailed();
        $this->assertDatabaseHas('arcade_leaderboard_entries', [
            'id' => $prior->id, 'score' => $prior->score + 12345,
        ]); // audit must not auto-repair or destroy evidence
    }

    public function test_missing_recent_evidence_is_detected_but_expired_retention_is_accepted(): void
    {
        $this->verifiedRun();
        DB::table('arcade_replays')->delete();
        $audit = app(ArcadeIntegrityAudit::class)->inspect();
        $this->assertSame(1, $audit['checks']['missing_recent_replay_evidence']);
        DB::table('arcade_runs')->update([
            'completed_at' => now()->subDays(40),
        ]);
        $this->assertSame(0,
            app(ArcadeIntegrityAudit::class)->inspect()['checks']['missing_recent_replay_evidence']);
    }

    public function test_cascading_account_erasure_keeps_no_orphaned_rankings(): void
    {
        $rows = $this->verifiedRun();
        $this->withToken($rows['player']['token'])->deleteJson('/api/v1/arcade/player')
            ->assertOk();
        $this->assertDatabaseCount('arcade_players', 0);
        $this->assertDatabaseCount('arcade_runs', 0);
        $this->assertDatabaseCount('arcade_replays', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->assertSame('ok', app(ArcadeIntegrityAudit::class)->inspect()['status']);
    }
}
