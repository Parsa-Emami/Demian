<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeDriftReplayVerifier;
use App\Services\Arcade\RankedGameCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class CafeDriftReplayTest extends TestCase
{
    use RefreshDatabase;

    private function fixtures(int ...$seeds): array
    {
        $process = new Process(['node', base_path('tools/generate_drift_replay_fixtures.mjs'), ...array_map('strval', $seeds)]);
        $process->mustRun();
        return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    }

    private function player(): array
    {
        return $this->withHeaders(['Authorization' => ''])->postJson('/api/v1/arcade/players',
            ['display_name' => 'Drift Player'])->assertCreated()->json();
    }

    private function start(array $player, ?string $requestId = null): array
    {
        return $this->withToken($player['token'])->postJson('/api/v1/arcade/turn-runs', [
            'game_id' => 'cafe-drift', 'rules_version' => CafeDriftReplayVerifier::VERSION,
            'request_id' => $requestId ?? (string) Str::uuid(),
        ])->assertCreated()->json();
    }

    public function test_authoritative_replay_matches_real_browser_rules_for_distinct_inputs_and_weeks(): void
    {
        $verifier = app(CafeDriftReplayVerifier::class);
        $this->assertSame(4095, $verifier->seedAt(CarbonImmutable::parse('2026-11-20T20:29:59Z')));
        $this->assertSame(4096, $verifier->seedAt(CarbonImmutable::parse('2026-11-20T20:30:00Z')));
        $cases = $this->fixtures();
        $this->assertCount(32, $cases);
        foreach ($cases as $case) {
            $this->assertSame($case['expected'], $verifier->verify($case['seed'], $case['ticks'], $case['frames']),
                $case['seed'].' / '.$case['pattern']);
        }
        $this->assertTrue(collect($cases)->contains(fn (array $case): bool => $case['cups'] === 0));
        $this->assertTrue(collect($cases)->contains(fn (array $case): bool => $case['cups'] > 0));
        $this->assertTrue(collect($cases)->contains(fn (array $case): bool => $case['nearMisses'] > 0 && $case['beans'] > 0));
    }

    public function test_accepted_score_is_server_computed_and_retries_are_atomic_and_immutable(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $player = $this->player();
        $request = (string) Str::uuid();
        $run = $this->start($player, $request);
        $this->assertSame($run['run_id'], $this->start($player, $request)['run_id']);
        $case = $this->fixtures($run['seed'])[1];
        $body = ['ticks' => $case['ticks'], 'frames' => $case['frames']];
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $this->postJson($url, $body)->assertUnprocessable();
        $this->travel(46)->seconds();
        $this->postJson($url, $body + ['score' => 2147483647])->assertUnprocessable();
        $this->postJson($url, $body + ['seed' => 1])->assertUnprocessable();
        $this->postJson($url, $body)->assertOk()->assertJsonPath('score', $case['expected']['score'])
            ->assertJsonPath('verification', 'server-replay');
        $this->postJson($url, $body)->assertOk()->assertJsonPath('score', $case['expected']['score']);
        $body['frames'][0][1] = $body['frames'][0][1] === 0 ? 1 : 0;
        $this->postJson($url, $body)->assertConflict();
        $this->assertDatabaseCount('arcade_replays', 1);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?period=weekly')->assertOk()
            ->assertJsonPath('data.0.score', $case['expected']['score'])->assertJsonCount(1, 'data');
        $this->assertFalse(app(RankedGameCatalog::class)->supportsPrizes('cafe-drift'));
    }

    public function test_weekly_course_is_common_and_bad_or_cross_account_proofs_cannot_score(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21T12:00:00Z'));
        $owner = $this->player();
        $other = $this->player();
        $run = $this->start($owner);
        $this->assertSame($run['seed'], $this->start($other)['seed']);
        $case = $this->fixtures($run['seed'])[0];
        $url = '/api/v1/arcade/turn-runs/'.$run['run_id'].'/complete';
        $body = ['ticks' => $case['ticks'], 'frames' => $case['frames']];
        $this->travel(46)->seconds();
        $this->postJson($url, $body)->assertNotFound();

        $this->withToken($owner['token']);
        foreach ([
            ['ticks' => 80, 'frames' => [[0, 0], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [5, 2], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [4, 29], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [4, 2], [4, 3], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [4, 0], [80, 0]]],
            ['ticks' => 80, 'frames' => [[0, 0], [80, 1]]],
            ['ticks' => 80, 'frames' => [[0, '0'], [80, 0]]],
            ['ticks' => 80, 'frames' => array_fill(0, 677, [0, 0])],
            ['ticks' => $case['ticks'] + 1, 'frames' => [[0, 0], [$case['ticks'] + 1, 0]]],
        ] as $modified) {
            $this->postJson($url, $modified)->assertUnprocessable();
        }
        $this->travel(6)->minutes();
        $this->postJson($url, $body)->assertGone();
        $this->assertDatabaseCount('arcade_replays', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
        $this->travelTo(CarbonImmutable::parse('2026-11-28T12:00:00Z'));
        $this->assertNotSame($run['seed'], $this->start($owner)['seed']);
        $this->getJson('/api/v1/arcade/leaderboards/cafe-drift?period=weekly')
            ->assertOk()->assertJsonCount(0, 'data');
    }
}
