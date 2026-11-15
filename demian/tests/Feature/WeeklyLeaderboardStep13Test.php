<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\WeeklyLeaderboardReadService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

final class WeeklyLeaderboardStep13Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-18T10:00:00Z'));
    }

    private function player(): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Weekly Rank '.Str::random(5),
        ])->assertCreated()->json();
    }

    private function run(array $person, int $score,
        string $start = '2026-11-17T10:00:00Z',
        string $game = 'dino-run'): string
    {
        $run = (string) Str::uuid();
        $version = $game === 'dino-run'
            ? 'cafe-runner-v2' : 'critters-test-v1';
        $started = CarbonImmutable::parse($start, 'UTC')->toDateTimeString();
        DB::table('arcade_runs')->insert([
            'id' => $run, 'player_id' => $person['player_id'],
            'request_id' => (string) Str::uuid(), 'game_id' => $game,
            'rules_version' => $version, 'character_slug' => 'darya',
            'seed' => 7, 'track_width' => 420,
            'status' => 'verified', 'score' => $score, 'ticks' => 120,
            'passed' => 1, 'replay_hash' => hash('sha256', $run),
            'started_at' => $started,
            'expires_at' => CarbonImmutable::parse($start, 'UTC')
                ->addHour()->toDateTimeString(),
            'completed_at' => CarbonImmutable::parse($start, 'UTC')
                ->addMinutes(3)->toDateTimeString(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => $game, 'rules_version' => $version,
            'period_key' => CompetitionClock::periodKeys(
                CarbonImmutable::parse($start, 'UTC'))[2],
            'player_id' => $person['player_id'], 'run_id' => $run,
            'score' => $score, 'achieved_at' => $started,
        ]);
        return $run;
    }

    public function test_live_week_uses_only_verified_personal_best_and_discloses_no_private_rank(): void
    {
        $one = $this->player();
        $this->run($one, 200);
        $this->getJson('/api/v1/arcade/competition/leaderboard')
            ->assertOk()->assertJsonPath('status', 'live_preview')
            ->assertJsonPath('is_current', true)
            ->assertJsonPath('data.0.competition_points', 0)
            ->assertJsonPath('data.0.qualified', false)
            ->assertJsonPath('data.0.source_game_id', 'dino-run')
            ->assertJsonPath('snapshot_hash', null)
            ->assertJsonPath('my_rank', null)
            ->assertJsonMissingPath('data.0.replay_hash')
            ->assertJsonMissingPath('data.0.token')
            ->assertJsonMissingPath('data.0.code')
            ->assertJsonPath('next_reset_at', '2026-11-20T20:30:00+00:00');
        $this->assertDatabaseCount('arcade_weekly_periods', 0);
        $this->assertDatabaseCount('arcade_weekly_fair_policies', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_exact_authenticated_position_below_public_twenty_and_provisional_state(): void
    {
        $persons = [];
        for ($i = 0; $i < 25; $i++) {
            $person = $this->player();
            $persons[] = $person;
            $this->run($person, 1000 - $i);
        }
        $public = $this->getJson('/api/v1/arcade/competition/leaderboard')
            ->assertOk()->assertJsonCount(20, 'data')
            ->assertJsonPath('participants', 25)
            ->assertJsonPath('qualified_participants', 25)
            ->assertJsonPath('data.0.competition_points', 1000)->json();
        $this->assertNull($public['my_rank']);
        $mine = $this->withToken($persons[24]['token'])
            ->getJson('/api/v1/arcade/player/competition/leaderboard')
            ->assertOk()->assertJsonPath('my_rank', 25)
            ->assertJsonPath('my_best.competition_points', 0)
            ->assertJsonPath('my_best.qualified', true)
            ->assertJsonPath('participants', 25)
            ->assertJsonCount(20, 'data');
        $this->assertStringContainsString('no-store',
            (string) $mine->headers->get('Cache-Control'));
        $this->withToken('invalid')
            ->getJson('/api/v1/arcade/player/competition/leaderboard')
            ->assertUnauthorized();
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_tie_scores_share_rank_and_provisional_game_never_outranks_qualified(): void
    {
        config()->set('demian-arcade.critters_ranked_enabled', true);
        $people = [];
        for ($i = 0; $i < 20; $i++) {
            $p = $this->player();
            $people[] = $p;
            $this->run($p, $i < 2 ? 900 : 800 - $i);
        }
        $this->run($people[0], 999999, '2026-11-17T11:00:00Z', 'cafe-critters');
        $data = $this->getJson('/api/v1/arcade/competition/leaderboard')
            ->assertOk()->assertJsonPath('data.0.rank', 1)
            ->assertJsonPath('data.1.rank', 1)
            ->assertJsonPath('data.2.rank', 3)->json();
        $this->assertSame('dino-run', $data['data'][0]['source_game_id']);
        $this->assertSame('dino-run', $data['data'][1]['source_game_id']);
        $this->assertSame(20, $data['participants']);
        $this->assertSame(20, $data['qualified_participants']);
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 0);
    }

    public function test_finalized_week_uses_persisted_snapshot_and_archives_exact_owner_rank(): void
    {
        $players = [];
        for ($i = 0; $i < 22; $i++) {
            $person = $this->player();
            $players[] = $person;
            $this->run($person, 700 - $i);
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-21T01:00:00Z'));
        app(WeeklySettlementService::class)->seal('2026-11-14');
        $history = $this->getJson('/api/v1/arcade/competition/leaderboard/weeks')
            ->assertOk()->json('weeks');
        $this->assertSame('2026-11-21', $history[0]['week']);
        $this->assertSame('current', $history[0]['status']);
        $this->assertSame('2026-11-14', $history[1]['week']);
        $this->assertSame('finalized', $history[1]['status']);
        $public = $this->getJson('/api/v1/arcade/competition/leaderboard?week=2026-11-14')
            ->assertOk()->assertJsonPath('status', 'finalized')
            ->assertJsonPath('is_current', false)
            ->assertJsonPath('participants', 22)
            ->assertJsonCount(20, 'data')->json();
        $this->assertSame(64, strlen($public['snapshot_hash']));
        $mine = $this->withToken($players[21]['token'])
            ->getJson('/api/v1/arcade/player/competition/leaderboard?week=2026-11-14')
            ->assertOk()->assertJsonPath('status', 'finalized')
            ->assertJsonPath('my_rank', 22)
            ->assertJsonPath('my_best.competition_points', 0);
        $this->assertStringContainsString('private',
            (string) $mine->headers->get('Cache-Control'));
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 22);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_invalid_future_non_saturday_and_large_result_pages_are_rejected(): void
    {
        foreach ([
            '?week=2026-11-15',
            '?week=2026-11-21',
            '?week=2025-01-04',
            '?limit=51',
            '?week=2026-99-99',
        ] as $query) {
            $this->getJson('/api/v1/arcade/competition/leaderboard'.$query)
                ->assertUnprocessable();
        }
        $this->getJson('/api/v1/arcade/competition/leaderboard?week=2026-11-07')
            ->assertOk()->assertJsonPath('status', 'archive_pending')
            ->assertJsonCount(0, 'data');
    }

    public function test_live_read_rejects_a_corrupt_score_and_ignores_non_verified_runs(): void
    {
        $person = $this->player();
        $run = $this->run($person, 500);
        DB::table('arcade_leaderboard_entries')->where('run_id', $run)
            ->update(['score' => 9999]);
        try {
            app(WeeklyLeaderboardReadService::class)->read();
            $this->fail('A mismatched leaderboard score was accepted.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('inconsistent', $expected->getMessage());
        }
        DB::table('arcade_leaderboard_entries')->where('run_id', $run)
            ->update(['score' => 500]);
        DB::table('arcade_runs')->where('id', $run)
            ->update(['status' => 'started']);
        $this->getJson('/api/v1/arcade/competition/leaderboard')
            ->assertOk()->assertJsonPath('participants', 0)->assertJsonCount(0, 'data');
    }

    public function test_erased_account_never_surfaces_in_live_and_final_historical_result(): void
    {
        $person = $this->player();
        $this->run($person, 500);
        DB::table('arcade_players')->where('id', $person['player_id'])->delete();
        $this->getJson('/api/v1/arcade/competition/leaderboard')
            ->assertOk()->assertJsonPath('participants', 0)
            ->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('arcade_coupons', 0);
    }
}
