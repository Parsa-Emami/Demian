<?php

namespace Tests\Feature;

use App\Models\ArcadeRun;
use App\Services\Arcade\CafeCrittersReplayVerifier;
use App\Services\Arcade\RankedGameCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CafeCrittersRankedReplayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T11:00:00Z'));
        config()->set('demian-arcade.critters_ranked_enabled', true);
    }

    private function player(string $name = 'Replay Guest'): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => $name,
        ])->assertCreated()->json();
    }

    private function started(array $player, ?string $requestId = null): array
    {
        return $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs', [
                'game_id' => 'cafe-critters',
                'rules_version' => CafeCrittersReplayVerifier::VERSION,
                'request_id' => $requestId ?? (string) Str::uuid(),
            ])->assertCreated()->json();
    }

    private function replay(int $seed): array
    {
        $names = app(CafeCrittersReplayVerifier::class)->targetIds($seed);
        $map = collect(CafeCrittersReplayVerifier::GUESTS)->keyBy('id');
        $events = [];
        $pageStart = 0;
        foreach ($names as $id) {
            $guest = $map[$id];
            $events[] = ['tick' => $pageStart + 10, 'kind' => 'select',
                'field' => 'light', 'option' => $guest['light']];
            $events[] = ['tick' => $pageStart + 20, 'kind' => 'select',
                'field' => 'food', 'option' => $guest['food']];
            $events[] = ['tick' => $pageStart + 30, 'kind' => 'select',
                'field' => 'decor', 'option' => $guest['decor']];
            $events[] = ['tick' => $pageStart + 70, 'kind' => 'invite'];
            $events[] = ['tick' => $pageStart + 80, 'kind' => 'next'];
            $pageStart += 80;
        }
        return ['ticks' => 241, 'actions' => $events];
    }

    public function test_default_off_fails_closed_in_catalog_start_completion_and_public_leaderboard(): void
    {
        config()->set('demian-arcade.critters_ranked_enabled', false);
        $player = $this->player();
        $this->assertFalse(app(RankedGameCatalog::class)->supportsRanked('cafe-critters'));
        $this->getJson('/api/v1/arcade/games')
            ->assertOk()->assertJsonFragment(['game_id' => 'cafe-critters',
                'ranked' => false, 'verification' => null]);
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs', [
                'request_id' => (string) Str::uuid(), 'game_id' => 'cafe-critters',
                'rules_version' => CafeCrittersReplayVerifier::VERSION,
            ])->assertStatus(503);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-critters')->assertNotFound();
        $this->assertDatabaseCount('arcade_runs', 0);
    }

    public function test_only_critters_has_a_turn_replay_verifier(): void
    {
        $player = $this->player();
        $this->assertTrue(app(RankedGameCatalog::class)->supportsRanked('cafe-critters'));
        foreach (['open-world', 'after-hours', 'cafe-rush', 'coffee-crash'] as $game) {
            $this->assertFalse(app(RankedGameCatalog::class)->supportsRanked($game));
            $this->withToken($player['token'])
                ->postJson('/api/v1/arcade/turn-runs', [
                    'request_id' => (string) Str::uuid(), 'game_id' => $game,
                    'rules_version' => CafeCrittersReplayVerifier::VERSION,
                ])->assertUnprocessable();
        }
        $this->assertDatabaseCount('arcade_runs', 0);
    }

    public function test_seeded_replay_verifier_recomputes_exact_score_and_all_three_guests(): void
    {
        $verifier = app(CafeCrittersReplayVerifier::class);
        foreach ([1, 2, 7, 8, 113, 2147483647] as $seed) {
            $payload = $this->replay($seed);
            $this->assertSame([
                'score' => 3000 + CafeCrittersReplayVerifier::MAX_TICKS - 241,
                'ticks' => 241, 'passed' => 3,
            ], $verifier->verify($seed, $payload['ticks'], $payload['actions']));
            $this->assertCount(3, $verifier->targetIds($seed));
        }
    }

    public function test_end_to_end_completion_ignores_client_claimed_score_and_is_idempotent(): void
    {
        $player = $this->player();
        $started = $this->started($player);
        $payload = $this->replay($started['seed']);
        $payload['score'] = 999999999;
        $this->travel(6)->seconds();
        $url = '/api/v1/arcade/turn-runs/'.$started['run_id'].'/complete';
        $this->withToken($player['token'])->postJson($url, $payload)
            ->assertOk()->assertJsonPath('score', 17159)
            ->assertJsonPath('status', 'verified')
            ->assertJsonPath('verification', 'server-replay');
        $this->postJson($url, $payload)->assertOk();
        $this->assertDatabaseCount('arcade_replays', 1);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->assertDatabaseHas('arcade_runs', [
            'id' => $started['run_id'], 'game_id' => 'cafe-critters',
            'rules_version' => CafeCrittersReplayVerifier::VERSION,
            'score' => 17159, 'ticks' => 241, 'passed' => 3,
        ]);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-critters')
            ->assertOk()->assertJsonPath('game_id', 'cafe-critters')
            ->assertJsonPath('data.0.display_name', 'Replay Guest')
            ->assertJsonPath('data.0.score', 17159);
        $this->getJson('/api/v1/arcade/leaderboards/dino-run')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_cross_player_completion_and_cross_game_run_replay_are_rejected(): void
    {
        $player = $this->player();
        $other = $this->player('Other Replay');
        $run = $this->started($player);
        $payload = $this->replay($run['seed']);
        $this->travel(5)->seconds();
        $this->withToken($other['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete', $payload)
            ->assertNotFound();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_truncated_and_mutated_runs_cannot_publish_scores(): void
    {
        $player = $this->player();
        $run = $this->started($player);
        $payload = $this->replay($run['seed']);
        $this->travel(5)->seconds();
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $truncated = $payload;
        array_pop($truncated['actions']);
        $truncated['ticks'] = 231;
        $this->withToken($player['token'])->postJson($url, $truncated)
            ->assertUnprocessable();
        $tampered = $payload;
        $tampered['actions'][1]['option'] = 'invalid';
        $this->postJson($url, $tampered)->assertUnprocessable();
        $reordered = $payload;
        $reordered['actions'][1]['tick'] = $reordered['actions'][0]['tick'];
        $this->postJson($url, $reordered)->assertUnprocessable();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_early_completion_fails_even_with_syntactically_correct_inputs(): void
    {
        $player = $this->player();
        $run = $this->started($player);
        $payload = $this->replay($run['seed']);
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete', $payload)
            ->assertUnprocessable();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_replayed_request_id_cannot_switch_game_or_rules(): void
    {
        $player = $this->player();
        $request = (string) Str::uuid();
        $first = $this->started($player, $request);
        $second = $this->started($player, $request);
        $this->assertSame($first, $second);
        $this->withToken($player['token'])->postJson('/api/v1/arcade/turn-runs', [
            'request_id' => $request, 'game_id' => 'cafe-critters',
            'rules_version' => 'bad',
        ])->assertConflict();
        $this->assertDatabaseCount('arcade_runs', 1);
    }

    public function test_second_completion_with_different_proof_fails(): void
    {
        $player = $this->player();
        $run = $this->started($player);
        $payload = $this->replay($run['seed']);
        $this->travel(6)->seconds();
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $this->withToken($player['token'])->postJson($url, $payload)->assertOk();
        $payload['actions'][0]['tick']++;
        $this->postJson($url, $payload)->assertConflict();
        $this->assertDatabaseCount('arcade_replays', 1);
    }

    public function test_expired_and_weekly_sealed_runs_fail_closed(): void
    {
        $player = $this->player();
        $run = $this->started($player);
        $payload = $this->replay($run['seed']);
        ArcadeRun::query()->whereKey($run['run_id'])
            ->update(['expires_at' => now()->subSecond()]);
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete', $payload)
            ->assertGone();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_disabled_flag_rejects_even_previous_started_run_completion(): void
    {
        $player = $this->player();
        $run = $this->started($player);
        config()->set('demian-arcade.critters_ranked_enabled', false);
        $this->travel(6)->seconds();
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
                $this->replay($run['seed']))
            ->assertStatus(503);
        $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_invalid_action_keys_and_resource_caps_fail_validation(): void
    {
        $player = $this->player();
        $run = $this->started($player);
        $payload = $this->replay($run['seed']);
        $this->travel(5)->seconds();
        $payload['actions'][0]['adminOverride'] = 'true';
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete', $payload)
            ->assertUnprocessable();
        $payload = $this->replay($run['seed']);
        $payload['actions'] = array_fill(0, 241, $payload['actions'][0]);
        $this->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete', $payload)
            ->assertUnprocessable();
        $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_game_catalog_only_marks_enabled_verifier_as_ranked(): void
    {
        $games = $this->getJson('/api/v1/arcade/games')
            ->assertOk()->json('games');
        $ranked = array_values(array_filter($games, fn (array $game) => $game['ranked']));
        $this->assertSame(['dino-run', 'cafe-critters'],
            array_values(array_map(fn (array $x) => $x['game_id'], $ranked)));
    }
}
