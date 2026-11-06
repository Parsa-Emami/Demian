<?php

namespace Tests\Feature;

use App\Models\ArcadeRun;
use App\Services\Arcade\RunnerReplayVerifier;
use App\Services\Arcade\LeaderboardService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ArcadePlatformTest extends TestCase
{
    use RefreshDatabase;

    private function identity(string $name = 'Parsa'): array
    {
        return $this->postJson('/api/v1/arcade/players', ['display_name' => $name])->assertCreated()->json();
    }

    private function payload(array $fixture): array
    {
        return ['ticks' => $fixture['ticks'], 'transitions' => $fixture['transitions']];
    }

    private function fixtures(): array
    {
        return json_decode(file_get_contents(base_path('tests/Fixtures/runner-replays.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    private function createRun(array $player, array $fixture): array
    {
        $data = ['request_id' => (string) Str::uuid(), 'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v1', 'character_slug' => 'darya', 'track_width' => $fixture['width']];
        $response = $this->withToken($player['token'])->postJson('/api/v1/arcade/runs', $data)->assertCreated()->json();
        ArcadeRun::query()->findOrFail($response['run_id'])->update(['seed' => $fixture['seed'], 'started_at' => now()->subSeconds((int) ceil($fixture['ticks'] / 60) + 1)]);

        return $response;
    }

    public function test_php_replays_match_javascript_fixtures_exactly(): void
    {
        foreach ($this->fixtures() as $fixture) {
            $result = app(RunnerReplayVerifier::class)->verify($fixture['seed'], $fixture['width'], $fixture['ticks'], $fixture['transitions']);
            $this->assertSame($fixture['expected'], $result);
        }
    }

    public function test_completion_ignores_claimed_score_and_is_idempotent(): void
    {
        $player = $this->identity(); $fixture = $this->fixtures()[0]; $run = $this->createRun($player, $fixture);
        $url = '/api/v1/arcade/runs/'.$run['run_id'].'/complete';
        $payload = [...$this->payload($fixture), 'score' => 99999999];
        $this->withToken($player['token'])->postJson($url, $payload)->assertOk()->assertJsonPath('score', $fixture['expected']['score'])->assertJsonPath('status', 'verified');
        $this->postJson($url, $payload)->assertOk();
        $this->assertDatabaseCount('arcade_replays', 1); $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->getJson('/api/v1/arcade/leaderboards/dino-run')->assertOk()->assertJsonPath('data.0.display_name', 'Parsa')->assertJsonMissingPath('data.0.token_hash');
    }

    public function test_completed_run_rejects_different_evidence(): void
    {
        $player = $this->identity(); $fixture = $this->fixtures()[0]; $run = $this->createRun($player, $fixture);
        $url = '/api/v1/arcade/runs/'.$run['run_id'].'/complete'; $payload = $this->payload($fixture);
        $this->withToken($player['token'])->postJson($url, $payload)->assertOk();
        $payload['transitions'][0]['mask'] ^= 2;
        $this->postJson($url, $payload)->assertConflict();
    }

    public function test_player_cannot_complete_another_players_run(): void
    {
        $first = $this->identity(); $second = $this->identity('Second'); $fixture = $this->fixtures()[0]; $run = $this->createRun($first, $fixture);
        $this->withToken($second['token'])->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))->assertNotFound();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_expired_run_is_rejected(): void
    {
        $player = $this->identity(); $fixture = $this->fixtures()[0]; $run = $this->createRun($player, $fixture);
        ArcadeRun::query()->findOrFail($run['run_id'])->update(['expires_at' => now()->subSecond()]);
        $this->withToken($player['token'])->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))->assertGone();
    }

    public function test_replay_ahead_of_server_clock_is_rejected(): void
    {
        $player = $this->identity(); $fixture = $this->fixtures()[2]; $run = $this->createRun($player, $fixture);
        ArcadeRun::query()->findOrFail($run['run_id'])->update(['started_at' => now()]);
        $this->withToken($player['token'])->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))->assertUnprocessable();
    }

    public function test_truncated_and_unordered_replays_do_not_publish_scores(): void
    {
        $player = $this->identity(); $fixture = $this->fixtures()[0]; $run = $this->createRun($player, $fixture);
        $payload = $this->payload($fixture); $payload['ticks']--;
        $url = '/api/v1/arcade/runs/'.$run['run_id'].'/complete';
        $this->withToken($player['token'])->postJson($url, $payload)->assertUnprocessable();
        $payload = $this->payload($fixture); $payload['transitions'][] = $payload['transitions'][0];
        $this->postJson($url, $payload)->assertUnprocessable(); $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_start_request_retry_preserves_seed_and_rejects_reused_ids(): void
    {
        $player = $this->identity();
        $payload = ['request_id' => (string) Str::uuid(), 'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v1', 'character_slug' => 'tiam', 'track_width' => 420];
        $one = $this->withToken($player['token'])->postJson('/api/v1/arcade/runs', $payload)->assertCreated()->json();
        $two = $this->postJson('/api/v1/arcade/runs', $payload)->assertCreated()->json(); $this->assertSame($one, $two);
        $payload['character_slug'] = 'hanna'; $this->postJson('/api/v1/arcade/runs', $payload)->assertConflict();
        $this->assertDatabaseCount('arcade_runs', 1);
    }

    public function test_validation_authentication_and_period_boundaries(): void
    {
        $this->postJson('/api/v1/arcade/players', ['display_name' => '<script>'])->assertUnprocessable();
        $this->postJson('/api/v1/arcade/runs', [])->assertUnauthorized();
        $this->getJson('/api/v1/arcade/leaderboards/dino-run?period=unknown')->assertUnprocessable();
        $this->assertSame(['all', 'daily:2026-12-31', 'weekly:2026-53'], LeaderboardService::periodKeys(CarbonImmutable::parse('2027-01-01T01:30:00+03:30')));
    }

    public function test_pruning_keeps_verified_records_and_best_scores(): void
    {
        $player = $this->identity(); $fixture = $this->fixtures()[0]; $run = $this->createRun($player, $fixture);
        $this->withToken($player['token'])->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))->assertOk();
        DB::table('arcade_replays')->update(['created_at' => now()->subDays(40)]);
        $this->artisan('arcade:prune')->assertSuccessful();
        $this->assertDatabaseCount('arcade_replays', 0); $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->assertDatabaseHas('arcade_runs', ['id' => $run['run_id'], 'status' => 'verified']);
    }
}
