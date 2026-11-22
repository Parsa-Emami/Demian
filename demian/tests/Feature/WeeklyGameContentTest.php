<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeCrittersReplayVerifier;
use App\Services\Arcade\CoffeeCrashReplayVerifier;
use App\Services\Arcade\RunnerReplayVerifier;
use Carbon\CarbonImmutable;
use Domain\Arcade\WeeklyContent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class WeeklyGameContentTest extends TestCase
{
    use RefreshDatabase;

    private function fixtures(): array
    {
        return json_decode((new Process(['node', base_path('tools/generate_weekly_game_fixtures.mjs')]))
            ->mustRun()->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    }

    public function test_weekly_sources_and_real_replay_results_match_the_browser_models(): void
    {
        $runner = app(RunnerReplayVerifier::class);
        $coffee = app(CoffeeCrashReplayVerifier::class);
        $critters = app(CafeCrittersReplayVerifier::class);
        foreach ($this->fixtures() as $fixture) {
            ['week' => $week, 'character' => $character, 'seed' => $seed, 'profiles' => $profiles, 'replays' => $replays] = $fixture;
            $this->assertSame($profiles['runner'], WeeklyContent::runner($runner->rules(), $week, $character));
            $this->assertSame($profiles['coffee'], WeeklyContent::coffee($week, 1));
            $this->assertSame($profiles['critters'], WeeklyContent::critters($week));
            $this->assertSame($profiles['after'], WeeklyContent::shiftCards($week));
            $this->assertSame($profiles['rush'], array_map(fn (int $i) => WeeklyContent::rushOrder($week, $i), range(0, 5)));
            $this->assertSame($profiles['world'], WeeklyContent::worldRoute($week));
            $r = $replays['runner'];
            $this->assertSame(['score' => $r['score'], 'ticks' => $r['ticks'], 'passed' => $r['passed']],
                $runner->verify($seed, 420, $r['ticks'], $r['transitions'], $week, $character));
            $c = $replays['coffee'];
            $this->assertSame(['score' => $c['score'], 'ticks' => $c['ticks'], 'passed' => $c['passed']],
                $coffee->verify($profiles['coffee']['seed'], $c['ticks'], $c['actions'], $profiles['coffee']));
            $p = $replays['critters'];
            $this->assertSame(3, $critters->verify($week + 1, $p['ticks'], $p['actions'], $week)['passed']);
        }
    }

    public function test_weekly_scores_publish_real_time_and_results_from_the_issued_week(): void
    {
        config()->set('demian-arcade.weekly_content_at', null);
        config()->set('demian-arcade.critters_ranked_enabled', true);
        config()->set('demian-arcade.coffee_ranked_enabled', true);
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Weekly Player'])->assertCreated()->json();
        $this->withToken($player['token']);
        $fixture = $this->fixtures()[0];
        foreach (['cafe-critters' => 'critters', 'coffee-crash' => 'coffee'] as $game => $fixtureKey) {
            $version = WeeklyContent::version($game);
            $run = $this->postJson('/api/v1/arcade/turn-runs', [
                'request_id' => (string) Str::uuid(), 'game_id' => $game, 'rules_version' => $version,
            ])->assertCreated()->assertJsonPath('content_week', 0)->json();
            $this->assertSame($game === 'coffee-crash' ? WeeklyContent::coffee(0, 1)['seed'] : 1, $run['seed']);
            $this->travel(30)->seconds();
            $replay = $fixture['replays'][$fixtureKey];
            $verified = $this->postJson('/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete', [
                'ticks' => $replay['ticks'], 'actions' => $replay['actions'],
            ])->assertOk()->assertJsonPath('status', 'verified')->json();
            $this->getJson('/api/v1/arcade/leaderboards/'.$game.'?period=weekly')->assertOk()
                ->assertJsonPath('game_id', $game)->assertJsonPath('data.0.ticks', $replay['ticks'])
                ->assertJsonPath('data.0.passed', $verified['passed']);
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-28T12:00:00Z'));
        $this->getJson('/api/v1/arcade/leaderboards/coffee-crash?period=weekly')->assertOk()->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/arcade/turn-runs', ['request_id' => (string) Str::uuid(),
            'game_id' => 'coffee-crash', 'rules_version' => WeeklyContent::version('coffee-crash')])
            ->assertCreated()->assertJsonPath('content_week', 1)->assertJsonPath('seed', WeeklyContent::coffee(1, 1)['seed']);
    }
}
