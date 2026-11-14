<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeRouteGeometry;
use App\Services\Arcade\CafeRouteReplayVerifier;
use App\Services\Arcade\RankedGameCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class CafeRouteChallengeReplayTest extends TestCase
{
    use RefreshDatabase;

    private const GAMES = ['after-hours', 'cafe-rush', 'open-world'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        foreach (self::GAMES as $game) {
            config()->set('demian-arcade.route_ranked_enabled.'.$game, true);
            config()->set('demian-arcade.route_prizes_enabled.'.$game, false);
        }
    }

    private function player(string $name = 'Route Contestant'): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => $name,
        ])->assertCreated()->json();
    }

    private function start(array $player, string $game): array
    {
        return $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs', [
                'request_id' => (string) Str::uuid(),
                'game_id' => $game,
                'rules_version' => CafeRouteReplayVerifier::VERSIONS[$game],
            ])->assertCreated()->json();
    }

    private function fixture(string $game, int $seed): array
    {
        $process = new Process([
            'node', base_path('tools/generate_route_replay_fixtures.mjs'),
            $game, (string) $seed,
        ]);
        $process->setTimeout(30);
        $process->run();
        $this->assertTrue($process->isSuccessful(),
            'JavaScript navigation could not produce a legal route: '.
            $process->getErrorOutput());
        $result = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertCount(1, $result);

        return $result[0];
    }

    public function test_server_geometry_matches_canonical_fbx_source_snapshot(): void
    {
        $original = file_get_contents(resource_path('js/game/shared/cafe/FbxCafeData.js'));
        $this->assertIsString($original);
        $start = strpos($original, 'export default ');
        $this->assertNotFalse($start);
        $payload = rtrim(trim(substr($original, $start + strlen('export default '))), ';');
        $js = json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
        $php = json_decode(file_get_contents(resource_path('server/cafe_geometry_v5.json')),
            true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame($js['sourceSha256'], $php['source_sha256']);
        $this->assertSame($js['floorRows'], $php['floor_rows']);
        $this->assertSame($js['bounds'], $php['bounds']);
        $this->assertSame(count($js['colliders']), count($php['colliders']));
        $this->assertSame(5, $php['layout_version']);
        $this->assertSame($php['source_sha256'],
            app(CafeRouteGeometry::class)->identity()['source_sha256']);
    }

    public function test_all_three_routes_match_real_js_collision_navigation_fixtures(): void
    {
        foreach (self::GAMES as $game) {
            $fixture = $this->fixture($game, 7);
            $this->assertCount(count(app(CafeRouteReplayVerifier::class)
                ->goals($game, 7)), $fixture['goals']);
            $result = app(CafeRouteReplayVerifier::class)->verify(
                $game, $fixture['seed'], $fixture['ticks'], $fixture['actions']);
            $this->assertSame($fixture['ticks'], $result['ticks']);
            $this->assertSame(count($fixture['goals']), $result['passed']);
            $this->assertGreaterThan(0, $result['score']);
            $this->assertLessThanOrEqual(CafeRouteReplayVerifier::MAX_ACTIONS,
                count($fixture['actions']));
        }
    }

    public function test_end_to_end_replay_proves_scores_and_public_game_isolation(): void
    {
        foreach (self::GAMES as $game) {
            $player = $this->player(ucwords(str_replace('-', ' ', $game)));
            $run = $this->start($player, $game);
            $this->assertSame(CafeRouteReplayVerifier::VERSIONS[$game],
                $run['rules_version']);
            $this->assertCount(count(app(CafeRouteReplayVerifier::class)
                ->goals($game, $run['seed'])), $run['goals']);
            $fixture = $this->fixture($game, $run['seed']);
            $elapsed = (int) ceil($fixture['ticks']/60)+1;
            $this->travel($elapsed)->seconds();
            $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
            $response = $this->withToken($player['token'])->postJson($url, [
                'ticks' => $fixture['ticks'], 'actions' => $fixture['actions'],
                'score' => 99999999, 'passed' => 999,
            ])->assertOk()->assertJsonPath('verification', 'server-replay')
                ->assertJsonPath('status', 'verified');
            $this->assertSame(count($fixture['goals']), $response->json('passed'));
            $this->assertSame((int)(count($fixture['goals'])*1000
                + app(CafeRouteReplayVerifier::class)->seconds($game)*60
                - $fixture['ticks']), $response->json('score'));
            $this->postJson($url, [
                'ticks' => $fixture['ticks'], 'actions' => $fixture['actions']
            ])->assertOk();
            $this->getJson('/api/v1/arcade/leaderboards/'.$game)
                ->assertOk()->assertJsonPath('game_id', $game)
                ->assertJsonPath('data.0.score', $response->json('score'));
            $this->assertDatabaseHas('arcade_runs', [
                'id' => $run['run_id'], 'status' => 'verified', 'game_id' => $game,
            ]);
        }
        $this->assertDatabaseCount('arcade_replays', 3);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 9);
    }

    public function test_disabled_routes_and_prize_flags_are_fail_closed_by_default(): void
    {
        $player = $this->player();
        foreach (self::GAMES as $game) {
            config()->set('demian-arcade.route_ranked_enabled.'.$game, false);
            config()->set('demian-arcade.route_prizes_enabled.'.$game, true);
            $this->assertFalse(app(RankedGameCatalog::class)->supportsRanked($game));
            $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes($game));
            $this->withToken($player['token'])
                ->postJson('/api/v1/arcade/turn-runs', [
                    'game_id' => $game,
                    'request_id' => (string) Str::uuid(),
                    'rules_version' => CafeRouteReplayVerifier::VERSIONS[$game],
                ])->assertStatus(503);
            $this->getJson('/api/v1/arcade/leaderboards/'.$game)->assertNotFound();
            config()->set('demian-arcade.route_ranked_enabled.'.$game, true);
            config()->set('demian-arcade.route_prizes_enabled.'.$game, false);
        }
        $this->assertDatabaseCount('arcade_runs', 0);
    }

    public function test_direct_score_post_and_nonexistent_verifier_cannot_create_ranks(): void
    {
        $player = $this->player();
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs', [
                'game_id'=>'nonexistent', 'request_id'=>(string)Str::uuid(),
                'rules_version'=>'insecure-v1',
            ])->assertUnprocessable();
        $this->postJson('/api/v1/arcade/runs', [
            'game_id'=>'open-world', 'score'=>999999,
            'rules_version'=>'open-world-route-v1',
            'request_id'=>(string) Str::uuid(),
        ])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_teleport_through_geometry_and_impossible_speed_are_rejected(): void
    {
        $fixture = $this->fixture('open-world', 7);
        $tampered = $fixture['actions'];
        $tampered[0]['x'] += 25;
        try {
            app(CafeRouteReplayVerifier::class)->verify('open-world', 7,
                $fixture['ticks'], $tampered);
            $this->fail('Impossible teleport accepted.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('replay', $e->errors());
        }
        $tampered = $fixture['actions'];
        $tampered[1]['tick'] = $tampered[0]['tick'];
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(CafeRouteReplayVerifier::class)->verify('open-world', 7,
            $fixture['ticks'], $tampered);
    }

    public function test_fake_checkpoint_and_truncated_evidence_are_rejected(): void
    {
        $fixture = $this->fixture('after-hours', 7);
        $tampered = $fixture['actions'];
        $last = array_key_last($tampered);
        $tampered[$last]['target'] = 'admin-override';
        try {
            app(CafeRouteReplayVerifier::class)->verify('after-hours', 7,
                $fixture['ticks'], $tampered);
            $this->fail('Wrong target accepted.');
        } catch (\Illuminate\Validation\ValidationException $expected) {
            $this->assertArrayHasKey('replay', $expected->errors());
        }
        array_pop($fixture['actions']);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(CafeRouteReplayVerifier::class)->verify('after-hours', 7,
            $fixture['ticks']-1, $fixture['actions']);
    }

    public function test_other_player_cannot_complete_a_valid_cafe_trial(): void
    {
        $owner = $this->player();
        $other = $this->player('Another World Guest');
        $run = $this->start($owner, 'open-world');
        $fixture = $this->fixture('open-world', $run['seed']);
        $this->travel((int) ceil($fixture['ticks']/60)+1)->seconds();
        $this->withToken($other['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
            ['ticks'=>$fixture['ticks'], 'actions'=>$fixture['actions']]
        )->assertNotFound();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_early_completion_is_rejected_by_wall_clock_even_with_correct_geometry(): void
    {
        $owner = $this->player();
        $run = $this->start($owner, 'open-world');
        $fixture = $this->fixture('open-world', $run['seed']);
        $this->withToken($owner['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
            ['ticks'=>$fixture['ticks'], 'actions'=>$fixture['actions']]
        )->assertUnprocessable();
        $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_invalid_route_actions_fail_validation_before_replay(): void
    {
        $owner = $this->player();
        $run = $this->start($owner, 'cafe-rush');
        $this->withToken($owner['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
            ['ticks'=>120, 'actions'=>[
                ['tick'=>10, 'kind'=>'move', 'x'=>0, 'z'=>0, 'givePrize'=>true],
            ]]
        )->assertUnprocessable();
        $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_ranking_does_not_grant_financial_prizes_without_independent_approval(): void
    {
        foreach (self::GAMES as $game) {
            $this->assertTrue(app(RankedGameCatalog::class)->supportsRanked($game));
            $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes($game));
        }
    }
}
