<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\RunnerReplayVerifier;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class WeeklySettlementTest extends TestCase
{
    use RefreshDatabase;

    private function player(): string
    {
        $id = (string) Str::uuid();
        DB::table('arcade_players')->insert([
            'id' => $id, 'display_name' => 'Settlement Tester',
            'token_hash' => hash('sha256', $id),
            'token_expires_at' => now()->addDays(30),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }

    private function verified(string $player, int $score, string $started,
        string $game = 'dino-run', string $version = 'cafe-runner-v2'): string
    {
        $id = (string) Str::uuid();
        $time = CarbonImmutable::parse($started, 'UTC')->utc()->toDateTimeString();
        DB::table('arcade_runs')->insert([
            'id' => $id, 'player_id' => $player, 'request_id' => (string) Str::uuid(),
            'game_id' => $game, 'rules_version' => $version,
            'character_slug' => 'darya', 'seed' => 123, 'track_width' => 420,
            'status' => 'verified', 'score' => $score, 'ticks' => 120, 'passed' => 1,
            'replay_hash' => hash('sha256', $id), 'started_at' => $time,
            'expires_at' => CarbonImmutable::parse($started, 'UTC')->addHour()->toDateTimeString(),
            'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => $game, 'rules_version' => $version,
            'period_key' => CompetitionClock::periodKeys(CarbonImmutable::parse($started, 'UTC'))[2],
            'player_id' => $player, 'run_id' => $id,
            'score' => $score, 'achieved_at' => $time,
        ]);
        return $id;
    }

    public function test_early_and_invalid_season_seals_fail_closed(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:59Z'));
        try {
            app(WeeklySettlementService::class)->seal('2026-11-07');
            $this->fail('Week sealed before Saturday cutoff.');
        } catch (\RuntimeException $expected) {
            $this->assertStringContainsString('closing boundary', $expected->getMessage());
        }
        foreach (['2026-11-12', '2026-02-30', 'tomorrow'] as $date) {
            try {
                app(WeeklySettlementService::class)->seal($date);
                $this->fail('Malformed week accepted.');
            } catch (\InvalidArgumentException $expected) {
                $this->assertNotSame('', $expected->getMessage());
            }
        }
        $this->assertDatabaseCount('arcade_weekly_periods', 0);
    }

    public function test_all_verified_ranks_are_snapshotted_but_only_ten_winners_are_selected(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        for ($i = 1; $i <= 12; $i++) {
            $this->verified($this->player(), 1000 - $i, '2026-11-10T10:00:00Z');
        }
        $result = app(WeeklySettlementService::class)->seal('2026-11-07');
        $this->assertSame('sealed', $result['status']);
        $this->assertSame(12, $result['participants']);
        $this->assertSame(10, $result['winners']);
        $this->assertDatabaseCount('arcade_weekly_results', 12);
        $this->assertDatabaseCount('arcade_weekly_winners', 10);
        $this->assertDatabaseCount('arcade_weekly_settlement_events', 1);
        $this->assertSame(range(1, 12), DB::table('arcade_weekly_results')
            ->orderBy('technical_rank')->pluck('technical_rank')->all());
        $this->assertSame(range(1, 10), DB::table('arcade_weekly_winners')
            ->orderBy('prize_rank')->pluck('prize_rank')->all());
        $this->assertSame(64, strlen(DB::table('arcade_weekly_periods')->value('snapshot_hash')));
        $this->assertSame('already_sealed', app(WeeklySettlementService::class)
            ->seal('2026-11-07')['status']);
        $this->assertDatabaseCount('arcade_weekly_settlement_events', 1);
    }

    public function test_new_players_take_priority_over_previous_week_winners(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21T01:00:00Z'));
        $old = $this->player(); $new = $this->player();
        $this->verified($old, 500, '2026-11-10T10:00:00Z');
        app(WeeklySettlementService::class)->seal('2026-11-07');
        $this->verified($old, 800, '2026-11-17T10:00:00Z');
        $this->verified($new, 200, '2026-11-17T11:00:00Z');
        app(WeeklySettlementService::class)->seal('2026-11-14');
        $rows = DB::table('arcade_weekly_winners')
            ->where('period_key', 'weekly:tehran:2026-11-14')
            ->orderBy('prize_rank')->get();
        $this->assertSame([$new, $old], $rows->pluck('player_id')->all());
        $this->assertSame([2, 1], $rows->pluck('technical_rank')->all());
        $this->assertSame([0, 1], $rows->pluck('previous_winner')
            ->map(fn ($v) => (int) $v)->all());
    }

    public function test_inflight_run_must_expire_before_period_seals(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:40:00Z'));
        $id = (string) Str::uuid();
        DB::table('arcade_runs')->insert([
            'id' => $id, 'player_id' => $this->player(), 'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
            'character_slug' => 'darya', 'seed' => 123, 'track_width' => 420,
            'status' => 'started', 'score' => 0, 'ticks' => 0, 'passed' => 0,
            'started_at' => '2026-11-13 20:25:00', 'expires_at' => '2026-11-13 21:00:00',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        try {
            app(WeeklySettlementService::class)->seal('2026-11-07');
            $this->fail('Accepted in-flight run.');
        } catch (\RuntimeException $expected) {
            $this->assertStringContainsString('in-flight', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_weekly_settlement_events', 0);
        DB::table('arcade_runs')->where('id', $id)->update([
            'expires_at' => '2026-11-13 20:39:00',
        ]);
        $this->assertSame('sealed', app(WeeklySettlementService::class)->seal('2026-11-07')['status']);
    }

    public function test_tampered_score_causes_atomic_rollback(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        $id = $this->verified($this->player(), 100, '2026-11-10T10:00:00Z');
        DB::table('arcade_leaderboard_entries')->where('run_id', $id)->update(['score' => 99999]);
        try {
            app(WeeklySettlementService::class)->seal('2026-11-07');
            $this->fail('Accepted tampered leaderboard.');
        } catch (\RuntimeException $expected) {
            $this->assertStringContainsString('inconsistent', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_weekly_periods', 0);
        $this->assertDatabaseCount('arcade_weekly_results', 0);
        $this->assertDatabaseCount('arcade_weekly_winners', 0);
    }

    public function test_missing_best_and_mixed_rule_versions_fail_closed(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        $id = $this->verified($this->player(), 100, '2026-11-10T10:00:00Z');
        DB::table('arcade_leaderboard_entries')->where('run_id', $id)->delete();
        try {
            app(WeeklySettlementService::class)->seal('2026-11-07');
            $this->fail('Missing personal best was accepted.');
        } catch (\RuntimeException $expected) {
            $this->assertStringContainsString('no weekly', $expected->getMessage());
        }
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
            'period_key' => 'weekly:tehran:2026-11-07',
            'player_id' => DB::table('arcade_runs')->where('id', $id)->value('player_id'),
            'run_id' => $id, 'score' => 100, 'achieved_at' => '2026-11-10 10:00:00',
        ]);
        $this->verified($this->player(), 110, '2026-11-10T10:00:00Z', 'dino-run', 'future-rules');
        $this->expectException(\RuntimeException::class);
        app(WeeklySettlementService::class)->seal('2026-11-07');
    }

    public function test_unranked_game_is_never_awarded(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        $this->verified($this->player(), 100, '2026-11-10T10:00:00Z', 'coffee-crash');
        $this->expectException(\RuntimeException::class);
        app(WeeklySettlementService::class)->seal('2026-11-07');
    }

    public function test_player_erasure_keeps_snapshot_but_removes_foreign_identifiers(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        $person = $this->player();
        $this->verified($person, 100, '2026-11-10T10:00:00Z');
        app(WeeklySettlementService::class)->seal('2026-11-07');
        DB::table('arcade_players')->where('id', $person)->delete();
        $this->assertDatabaseCount('arcade_weekly_winners', 1);
        $this->assertDatabaseCount('arcade_weekly_results', 1);
        $this->assertNull(DB::table('arcade_weekly_winners')->value('player_id'));
        $this->assertNull(DB::table('arcade_weekly_winners')->value('run_id'));
        $this->assertDatabaseHas('arcade_weekly_periods', [
            'period_key' => 'weekly:tehran:2026-11-07', 'status' => 'sealed',
        ]);
    }

    public function test_player_cannot_complete_run_after_period_is_sealed(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10T10:00:00Z'));
        $player = $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Replay Player',
        ])->assertCreated()->json();
        $fixture = json_decode(file_get_contents(base_path('tests/Fixtures/runner-replays.json')),
            true, flags: JSON_THROW_ON_ERROR)[0];
        $run = $this->withToken($player['token'])->postJson('/api/v1/arcade/runs', [
            'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
            'rules_version' => app(RunnerReplayVerifier::class)->rules()['version'],
            'character_slug' => 'darya', 'track_width' => $fixture['width'],
        ])->assertCreated()->json();
        $this->assertDatabaseHas('arcade_weekly_periods', [
            'period_key' => 'weekly:tehran:2026-11-07', 'status' => 'open',
        ]);
        DB::table('arcade_weekly_periods')->update(['status' => 'sealed', 'sealed_at' => now()]);
        $this->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', [
            'ticks' => $fixture['ticks'], 'transitions' => $fixture['transitions'],
        ])->assertConflict();
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_cli_requires_apply_and_backfill_is_chronological_and_idempotent(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21T01:00:00Z'));
        $this->artisan('arcade:seal-weeks', ['--week' => '2026-11-07'])->assertFailed();
        $this->assertDatabaseCount('arcade_weekly_periods', 0);
        $old = $this->player(); $new = $this->player();
        $this->verified($old, 300, '2026-11-10T10:00:00Z');
        $this->verified($old, 400, '2026-11-17T10:00:00Z');
        $this->verified($new, 100, '2026-11-17T10:05:00Z');
        $results = app(WeeklySettlementService::class)->sealPending();
        $this->assertSame(['weekly:tehran:2026-11-07', 'weekly:tehran:2026-11-14'],
            array_column($results, 'period_key'));
        $this->assertSame([], app(WeeklySettlementService::class)->sealPending());
        $this->assertSame($new, DB::table('arcade_weekly_winners')
            ->where('period_key', 'weekly:tehran:2026-11-14')->orderBy('prize_rank')
            ->value('player_id'));
        $this->artisan('arcade:seal-weeks', [
            '--week' => '2026-11-07', '--apply' => true, '--json' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_weekly_settlement_events', 2);
    }
}
