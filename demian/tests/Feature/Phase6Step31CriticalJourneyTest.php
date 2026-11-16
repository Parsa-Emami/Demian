<?php

namespace Tests\Feature;

use App\Services\Arcade\RunnerReplayVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 6 Step 31: one real HTTP/in-memory-database user journey.
 * Uses the authoritative PHP replay verifier; never trusts a client score.
 * Does not exercise coupon issuance against uncontrolled production inventory.
 */
final class Phase6Step31CriticalJourneyTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_authentic_run_forgery_rejection_verified_leaderboard_isolation_idempotence_and_erasure(): void
    {
        $player = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Step 31 Player',
        ])->assertCreated()->json();
        $other = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Step 31 Other',
        ])->assertCreated()->json();
        $fixture = json_decode(
            file_get_contents(base_path('tests/Fixtures/runner-replays.json')),
            true, flags: JSON_THROW_ON_ERROR
        )[0];
        $request = [
            'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run',
            'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'],
            'character_slug' => 'darya',
            'track_width' => $fixture['width'],
        ];
        $endpoint = '/api/v1/arcade/runs';
        $run = $this->withToken($player['token'])
            ->postJson($endpoint, $request)->assertCreated()->json();
        $this->withToken($player['token'])
            ->postJson($endpoint, $request)
            ->assertCreated()->assertJsonPath('run_id', $run['run_id']);
        $this->assertDatabaseCount('arcade_runs', 1);

        // Change *only test DB fixture* to a known server seed/time.
        // The HTTP endpoint and verifier still compute the actual score.
        DB::table('arcade_runs')->where('id', $run['run_id'])->update([
            'seed' => $fixture['seed'],
            'started_at' => now()->subSeconds(4),
        ]);
        $complete = '/api/v1/arcade/runs/'.$run['run_id'].'/complete';
        $proof = [
            'ticks' => $fixture['ticks'],
            'transitions' => $fixture['transitions'],
        ];
        $this->withToken($other['token'])
            ->postJson($complete, $proof)->assertNotFound();

        // Truncated fabricated replay must not write score, leaderboard or prize.
        $this->withToken($player['token'])->postJson($complete, [
            'ticks' => $fixture['ticks'] - 1,
            'transitions' => $fixture['transitions'],
            'score' => 999999,
        ])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);

        $this->postJson($complete, [...$proof, 'score' => 999999])
            ->assertOk()
            ->assertJsonPath('score', $fixture['expected']['score'])
            ->assertJsonPath('status', 'verified')
            ->assertJsonPath('verification', 'server-replay');
        $this->postJson($complete, $proof)
            ->assertOk()->assertJsonPath('score', $fixture['expected']['score']);
        $this->assertDatabaseCount('arcade_replays', 1);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->assertDatabaseCount('arcade_coupons', 0);

        $this->getJson('/api/v1/arcade/leaderboards/dino-run?period=weekly')
            ->assertOk()->assertJsonPath('data.0.display_name', 'Step 31 Player')
            ->assertJsonMissingPath('data.0.token_hash')
            ->assertJsonMissingPath('data.0.replay_hash');

        $this->withToken($player['token'])->deleteJson('/api/v1/arcade/player')
            ->assertOk()->assertJsonPath('status', 'deleted');
        $this->assertDatabaseCount('arcade_runs', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')
            ->assertUnauthorized();
    }
}
