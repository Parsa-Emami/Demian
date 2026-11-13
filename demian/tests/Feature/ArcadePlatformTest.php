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
        $data = ['request_id' => (string) Str::uuid(), 'game_id' => 'dino-run', 'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'], 'character_slug' => 'darya', 'track_width' => $fixture['width']];
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
        $payload = ['request_id' => (string) Str::uuid(), 'game_id' => 'dino-run', 'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'], 'character_slug' => 'tiam', 'track_width' => 420];
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
        $this->assertSame(['all', 'daily:2026-12-31', 'weekly:tehran:2026-12-26'], LeaderboardService::periodKeys(CarbonImmutable::parse('2027-01-01T01:30:00+03:30')));
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
    public function test_weekly_countdown_uses_saturday_tehran_and_preserves_history(): void
    {
        $clock = app(\App\Services\Arcade\CompetitionClock::class);
        $edge = CarbonImmutable::parse('2027-01-08T20:29:50Z');
        $snapshot = $clock->snapshot('weekly', $edge);
        $this->assertSame('weekly:tehran:2027-01-02', $snapshot['period_key']);
        $this->assertSame('Asia/Tehran', $snapshot['timezone']);
        $this->assertSame('2027-01-01T20:30:00+00:00', $snapshot['starts_at']);
        $this->assertSame('2027-01-08T20:30:00+00:00', $snapshot['next_reset_at']);
        $this->assertSame(10, $snapshot['seconds_remaining']);
        $next = $clock->snapshot('weekly', $edge->addSeconds(11));
        $this->assertSame('weekly:tehran:2027-01-09', $next['period_key']);
        $this->assertSame(604799, $next['seconds_remaining']);
        $this->assertNull($clock->snapshot('all', $edge)['next_reset_at']);
        $this->assertSame('2027-01-09T00:00:00+00:00', $clock->snapshot('daily', $edge)['next_reset_at']);
    }

    public function test_backfill_reconstructs_tehran_weekly_bests_without_deleting_legacy_rows(): void
    {
        $player = $this->identity('Backfill');
        $fixture = $this->fixtures()[0];
        $run = $this->createRun($player, $fixture);
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))
            ->assertOk();

        $verified = ArcadeRun::query()->findOrFail($run['run_id']);
        $weeklyKey = LeaderboardService::periodKeys($verified->started_at)[2];
        DB::table('arcade_leaderboard_entries')->where('period_key', $weeklyKey)->delete();
        $legacyKey = 'weekly:'.CarbonImmutable::instance($verified->started_at)->utc()->format('o-W');
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => 'dino-run', 'rules_version' => $verified->rules_version,
            'period_key' => $legacyKey, 'player_id' => $player['player_id'],
            'run_id' => $verified->id, 'score' => $verified->score,
            'achieved_at' => $verified->started_at,
        ]);

        $migration = require base_path('database/migrations/2026_11_13_000000_backfill_tehran_arcade_weekly_seasons.php');
        $migration->up();
        $migration->up(); // idempotent across interrupted/retried maintenance runs.
        $this->assertDatabaseHas('arcade_leaderboard_entries', ['player_id' => $player['player_id'], 'period_key' => $weeklyKey, 'score' => $verified->score]);
        $this->assertDatabaseHas('arcade_leaderboard_entries', ['player_id' => $player['player_id'], 'period_key' => $legacyKey]);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 4);
    }

    public function test_games_endpoint_never_licenses_unverified_mini_game_scores(): void
    {
        $games = $this->getJson('/api/v1/arcade/games')->assertOk()->json('games');
        $this->assertCount(6, $games);
        $ranked = array_values(array_filter($games, fn (array $game): bool => $game['ranked']));
        $this->assertSame(['dino-run'], array_column($ranked, 'game_id'));
        $this->assertSame('server-replay', $ranked[0]['verification']);
        $this->getJson('/api/v1/arcade/leaderboards/dino-run?period=weekly')
            ->assertOk()->assertJsonPath('period', 'weekly')
            ->assertJsonStructure(['server_time', 'next_reset_at', 'seconds_remaining', 'data']);
        $player = $this->identity();
        $request = ['request_id' => (string) Str::uuid(), 'game_id' => 'cafe-rush',
            'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'],
            'character_slug' => 'darya', 'track_width' => 420];
        $this->withToken($player['token'])->postJson('/api/v1/arcade/runs', $request)->assertUnprocessable();
        $this->assertDatabaseCount('arcade_runs', 0);
    }

    public function test_weekly_personal_best_requires_authentication_and_only_reads_verified_score(): void
    {
        $player = $this->identity();
        $url = '/api/v1/arcade/player/best?period=weekly';
        $this->getJson($url)->assertUnauthorized();
        $this->withToken($player['token'])->getJson($url)
            ->assertOk()->assertJsonPath('best', null)->assertJsonStructure(['next_reset_at', 'seconds_remaining']);
        $fixture = $this->fixtures()[0];
        $run = $this->createRun($player, $fixture);
        $this->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))->assertOk();
        $this->getJson($url)->assertOk()->assertJsonPath('best.score', $fixture['expected']['score'])
            ->assertJsonMissingPath('token_hash');
        $this->getJson('/api/v1/arcade/player/best?period=other')->assertUnprocessable();
    }

    public function test_personal_rank_follows_public_tie_breaks_and_weekly_is_default(): void
    {
        // Ranking is tested separately from registration throttling; keep live throttles unchanged.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $players = [$this->identity('First'), $this->identity('Second'), $this->identity('Third')];
        $fixture = $this->fixtures()[0];
        $sameStart = now()->subMinutes(5);
        foreach ($players as $player) {
            $run = $this->createRun($player, $fixture);
            ArcadeRun::query()->findOrFail($run['run_id'])->update(['started_at' => $sameStart]);
            $this->withToken($player['token'])
                ->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))
                ->assertOk();
        }

        $this->getJson('/api/v1/arcade/leaderboards/dino-run')
            ->assertOk()->assertJsonPath('period', 'weekly')
            ->assertJsonPath('data.1.display_name', 'Second');
        $this->withToken($players[1]['token'])->getJson('/api/v1/arcade/player/best')
            ->assertOk()->assertJsonPath('my_rank', 2)
            ->assertJsonPath('participants', 3)
            ->assertJsonPath('best.score', $fixture['expected']['score'])
            ->assertJsonMissingPath('token_hash');
        $this->withToken($players[2]['token'])->getJson('/api/v1/arcade/player/best?period=weekly')
            ->assertOk()->assertJsonPath('my_rank', 3);
        $this->withToken($players[0]['token'])->getJson('/api/v1/arcade/player/best?period=all')
            ->assertOk()->assertJsonPath('my_rank', 1)->assertJsonPath('participants', 3);
    }

    public function test_one_time_recovery_rotates_session_and_preserves_verified_scores(): void
    {
        // Keep rate limiters enabled in production; isolate this security contract from shared test counters.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $player = $this->identity('Recoverable');
        $fixture = $this->fixtures()[0];
        $run = $this->createRun($player, $fixture);
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))
            ->assertOk();
        $url = '/api/v1/arcade/player/recovery-link';
        $this->withToken('bad-token')->postJson($url)->assertUnauthorized();
        $code = $this->withToken($player['token'])->postJson($url)->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->json('recovery_code');
        $this->assertSame(64, strlen($code));
        $this->assertDatabaseHas('arcade_players', [
            'id' => $player['player_id'], 'recovery_hash' => hash('sha256', $code),
        ]);
        $this->getJson('/api/v1/arcade/player')->assertOk()
            ->assertJsonMissingPath('recovery_hash');
        $recovered = $this->postJson('/api/v1/arcade/players/recover', [
            'recovery_code' => $code,
        ])->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonMissingPath('recovery_code')->json();
        $this->assertSame($player['player_id'], $recovered['player_id']);
        $this->assertNotSame($player['token'], $recovered['token']);
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')
            ->assertUnauthorized();
        $this->withToken($recovered['token'])->getJson('/api/v1/arcade/player')
            ->assertOk()->assertJsonPath('display_name', 'Recoverable')
            ->assertJsonMissingPath('token_hash');
        $this->getJson('/api/v1/arcade/player/best?period=weekly')
            ->assertOk()->assertJsonPath('best.score', $fixture['expected']['score']);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->postJson('/api/v1/arcade/players/recover', [
            'recovery_code' => $code,
        ])->assertUnprocessable();
        $this->assertDatabaseHas('arcade_players', ['id' => $player['player_id'], 'recovery_hash' => null]);
    }

    public function test_new_recovery_link_invalidates_previous_secret(): void
    {
        // Keep rate limiters enabled in production; isolate this security contract from shared test counters.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $player = $this->identity('Rotation');
        $url = '/api/v1/arcade/player/recovery-link';
        $first = $this->withToken($player['token'])->postJson($url)->assertOk()->json('recovery_code');
        $second = $this->postJson($url)->assertOk()->json('recovery_code');
        $this->assertNotSame($first, $second);
        $this->postJson('/api/v1/arcade/players/recover', [
            'recovery_code' => $first,
        ])->assertUnprocessable();
        $this->postJson('/api/v1/arcade/players/recover', [
            'recovery_code' => $second,
        ])->assertOk()->assertJsonPath('display_name', 'Rotation');
    }

    public function test_player_can_read_and_erase_profile_with_cascading_ranked_records(): void
    {
        $player = $this->identity('WeekChampion');
        $this->getJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->withToken($player['token'])->getJson('/api/v1/arcade/player')
            ->assertOk()->assertJsonPath('display_name', 'WeekChampion')
            ->assertJsonMissingPath('token_hash');
        $fixture = $this->fixtures()[0];
        $run = $this->createRun($player, $fixture);
        $this->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', $this->payload($fixture))->assertOk();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->deleteJson('/api/v1/arcade/player')->assertOk()->assertJsonPath('status', 'deleted');
        $this->assertDatabaseCount('arcade_players', 0);
        $this->assertDatabaseCount('arcade_runs', 0);
        $this->assertDatabaseCount('arcade_replays', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->getJson('/api/v1/arcade/player')->assertUnauthorized();
    }

}
