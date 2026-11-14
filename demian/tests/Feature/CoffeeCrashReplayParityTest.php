<?php

namespace Tests\Feature;

use App\Models\ArcadeRun;
use App\Services\Arcade\CoffeeCrashReplayVerifier;
use App\Services\Arcade\RankedGameCatalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class CoffeeCrashReplayParityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-arcade.coffee_ranked_enabled', true);
    }

    private function fixture(int ...$seeds): array
    {
        $process = new Process([
            'node', base_path('tools/generate_coffee_replay_fixtures.mjs'),
            ...array_map('strval', $seeds),
        ]);
        $process->run();
        $this->assertTrue($process->isSuccessful(), $process->getErrorOutput());

        return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    }

    private function player(): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Puzzle Contestant',
        ])->assertCreated()->json();
    }

    private function start(array $player): array
    {
        return $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs', [
                'request_id' => (string) Str::uuid(),
                'game_id' => 'coffee-crash',
                'rules_version' => CoffeeCrashReplayVerifier::VERSION,
            ])->assertCreated()->json();
    }

    public function test_php_simulation_matches_real_javascript_model_scores_for_eight_seeds(): void
    {
        foreach ($this->fixture() as $case) {
            $this->assertSame($case['expected'],
                app(CoffeeCrashReplayVerifier::class)->verify(
                    $case['seed'], $case['ticks'], $case['actions']
                ), 'Divergent PHP/JS replay for seed '.$case['seed']);
            $this->assertContains($case['client']['result'], ['won', 'lost']);
        }
    }

    public function test_completing_actual_seeded_coffee_run_ignores_claimed_score(): void
    {
        $player = $this->player();
        $run = $this->start($player);
        $fixture = $this->fixture($run['seed'])[0];
        $this->travel((int) ceil($fixture['ticks'] / 60) + 2)->seconds();
        $this->withToken($player['token'])->postJson(
            '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
            ['ticks' => $fixture['ticks'], 'actions' => $fixture['actions'], 'score' => 99999999]
        )->assertOk()->assertJsonPath('score', $fixture['expected']['score'])
            ->assertJsonPath('status', 'verified');
        $this->assertDatabaseCount('arcade_replays', 1);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->assertDatabaseHas('arcade_runs', [
            'id' => $run['run_id'], 'game_id' => 'coffee-crash',
            'rules_version' => CoffeeCrashReplayVerifier::VERSION,
            'score' => $fixture['expected']['score'],
        ]);
        $this->getJson('/api/v1/arcade/leaderboards/coffee-crash')
            ->assertOk()->assertJsonPath('game_id', 'coffee-crash')
            ->assertJsonPath('data.0.score', $fixture['expected']['score']);
        // Other unenabled game leaderboards stay hidden even when Coffee is live.
        $this->getJson('/api/v1/arcade/leaderboards/cafe-critters')
            ->assertNotFound();
    }

    public function test_modified_swap_and_truncated_replay_are_rejected(): void
    {
        $player = $this->player();
        $run = $this->start($player);
        $fixture = $this->fixture($run['seed'])[0];
        $this->travel(40)->seconds();
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $bad = ['ticks' => $fixture['ticks'], 'actions' => $fixture['actions']];
        $bad['actions'][0]['b'] = $bad['actions'][0]['a'];
        $this->withToken($player['token'])->postJson($url, $bad)->assertUnprocessable();
        $bad = ['ticks' => $fixture['ticks'] - 60,
            'actions' => array_slice($fixture['actions'], 0, -1)];
        $this->postJson($url, $bad)->assertUnprocessable();
        $this->assertDatabaseCount('arcade_replays', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_default_off_blocks_ranked_run_and_public_leaderboard(): void
    {
        config()->set('demian-arcade.coffee_ranked_enabled', false);
        $player = $this->player();
        $this->assertFalse(app(RankedGameCatalog::class)->supportsRanked('coffee-crash'));
        $this->withToken($player['token'])->postJson('/api/v1/arcade/turn-runs', [
            'request_id' => (string) Str::uuid(),
            'game_id' => 'coffee-crash',
            'rules_version' => CoffeeCrashReplayVerifier::VERSION,
        ])->assertStatus(503);
        $this->getJson('/api/v1/arcade/leaderboards/coffee-crash')->assertNotFound();
    }

    public function test_expired_player_and_another_user_cannot_claim_valid_coffee_run(): void
    {
        $player = $this->player();
        $other = $this->player();
        $run = $this->start($player);
        $fixture = $this->fixture($run['seed'])[0];
        $this->travel(35)->seconds();
        $this->withToken($other['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
                ['ticks' => $fixture['ticks'], 'actions' => $fixture['actions']])
            ->assertNotFound();
        ArcadeRun::query()->whereKey($run['run_id'])
            ->update(['expires_at' => now()->subSecond()]);
        $this->withToken($player['token'])
            ->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete',
                ['ticks' => $fixture['ticks'], 'actions' => $fixture['actions']])
            ->assertGone();
        $this->assertDatabaseCount('arcade_replays', 0);
    }
}
