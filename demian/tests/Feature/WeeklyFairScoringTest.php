<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\WeeklyCompetitionService;
use App\Services\Arcade\WeeklyFairScoringService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

/**
 * Phase 3 Step 12: comparisons use verified weekly personal bests and
 * deterministic relative rank, never incomparable raw game scores or
 * client-calculated points. NO new coupon selection is enabled.
 */
final class WeeklyFairScoringTest extends TestCase
{
    use RefreshDatabase;

    private const WEEK = 'weekly:tehran:2026-11-07';
    private const START = '2026-11-10T10:00:00Z';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T01:00:00Z'));
        config()->set('demian-arcade.anticheat.enabled', false);
    }

    private function player(?string $token = null): string
    {
        $id = (string) Str::uuid();
        DB::table('arcade_players')->insert([
            'id' => $id, 'display_name' => 'Fair scoring player',
            'token_hash' => hash('sha256', $token ?? $id),
            'token_expires_at' => now()->addDays(30),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }

    private function source(string $game, string $player, int $score,
        string $at = self::START, string $version = 'fair-rules-v1'): array
    {
        return [
            'period_key' => self::WEEK,
            'game_id' => $game,
            'rules_version' => $version,
            'player_id' => $player,
            'run_id' => (string) Str::uuid(),
            'score' => $score,
            'achieved_at' => $at,
        ];
    }

    public function test_leagues_seal_only_scores_earned_after_phone_verification_and_keep_profiles_private(): void
    {
        $players = [];
        $token = Str::random(64);
        for ($i = 0; $i < 22; $i++) {
            $id = $this->player($i === 0 ? $token : null);
            $players[] = $id;
            $this->verified($id, 1000 - $i);
            if ($i !== 20) {
                DB::table('arcade_players')->where('id', $id)->update([
                    'contact_type' => 'phone',
                    'contact_hash' => hash('sha256', 'league-fixture-'.$i),
                    'phone_verified_at' => $i === 21 ? '2026-11-13 12:00:00' : '2026-11-09 12:00:00',
                ]);
            }
        }
        $board = '/api/v1/arcade/competition/leagues?league=legend';
        $mine = '/api/v1/arcade/player/competition/league';
        $this->getJson($board)->assertOk()->assertJsonPath('status', 'not_finalized');
        $this->getJson($board.'&week=2026-11-10')->assertUnprocessable();
        $this->getJson($mine)->assertUnauthorized();

        $settler = app(WeeklySettlementService::class);
        $settler->seal('2026-11-07');
        $this->assertDatabaseHas('arcade_skill_seasons', ['period_key' => self::WEEK, 'participants' => 20, 'qualified' => 20]);
        $this->assertDatabaseMissing('arcade_skill_standings', ['player_id' => $players[20]]);
        $this->assertDatabaseMissing('arcade_skill_standings', ['player_id' => $players[21]]);
        $this->getJson($board)->assertOk()
            ->assertJsonPath('data.0.points', 1000)->assertJsonPath('data.0.recognition', true)
            ->assertJsonPath('rules.financial_rewards', false)
            ->assertJsonMissingPath('data.0.player_id')->assertJsonMissingPath('data.0.run_id');
        $this->withToken($token)->getJson($mine)->assertOk()
            ->assertJsonPath('verified', true)->assertJsonPath('last_result.league', 'legend');
        $this->getJson('/api/v1/arcade/player/data/records?type=skill_leagues')
            ->assertOk()->assertJsonPath('data.0.league', 'legend')->assertJsonCount(1, 'data');

        $settler->seal('2026-11-07');
        $this->assertDatabaseCount('arcade_skill_standings', 20);
        $this->assertDatabaseCount('arcade_coupons', 0);
        DB::table('arcade_players')->where('id', $players[0])->delete();
        $this->assertDatabaseHas('arcade_skill_standings', ['player_id' => null, 'rank' => 1, 'league' => 'legend']);
        $this->getJson($board)->assertOk()->assertJsonPath('data.0.rank', 2);
    }

    private function verified(string $player, int $score, string $game = 'dino-run',
        string $version = 'cafe-runner-v2', string $at = self::START): string
    {
        $run = (string) Str::uuid();
        $started = CarbonImmutable::parse($at, 'UTC')->toDateTimeString();
        DB::table('arcade_runs')->insert([
            'id' => $run, 'player_id' => $player, 'request_id' => (string) Str::uuid(),
            'game_id' => $game, 'rules_version' => $version,
            'character_slug' => 'darya', 'seed' => 13, 'track_width' => 420,
            'status' => 'verified', 'score' => $score, 'ticks' => 600, 'passed' => 1,
            'replay_hash' => hash('sha256', $run), 'started_at' => $started,
            'expires_at' => CarbonImmutable::parse($at, 'UTC')->addHour()->toDateTimeString(),
            'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('arcade_leaderboard_entries')->insert([
            'game_id' => $game, 'rules_version' => $version,
            'period_key' => CompetitionClock::periodKeys(
                CarbonImmutable::parse($at, 'UTC'))[2],
            'player_id' => $player, 'run_id' => $run,
            'score' => $score, 'achieved_at' => $started,
        ]);
        return $run;
    }

    private function samplePolicy(): object
    {
        return (object) [
            'algorithm_version' => WeeklyFairScoringService::VERSION,
            'maximum_points' => WeeklyFairScoringService::MAX_POINTS,
            'minimum_cohort' => WeeklyFairScoringService::MIN_COHORT,
        ];
    }

    public function test_normalization_is_integer_bounded_and_does_not_compare_incompatible_raw_game_scores(): void
    {
        $first = [];
        $second = [];
        for ($i = 0; $i < 20; $i++) {
            $player = (string) Str::uuid();
            $first[] = $this->source('dino-run', $player, 1000 - $i * 10,
                '2026-11-10T10:00:00Z', 'runner-v1');
            $second[] = $this->source('cafe-rush', $player, 100000 - $i * 1000,
                '2026-11-10T10:01:00Z', 'rush-v1');
        }
        $s = app(WeeklyFairScoringService::class);
        $result = $s->calculate(self::WEEK, [...$first, ...$second], $this->samplePolicy());
        $this->assertCount(40, $result['games']);
        $this->assertCount(20, $result['standings']); // max, never SUM.
        $this->assertSame(64, strlen($result['sha256']));
        $gameBest = array_values(array_filter($result['games'],
            static fn (array $v): bool => $v['position'] === 1));
        $this->assertCount(2, $gameBest);
        $this->assertSame([1000, 1000], array_column($gameBest, 'competition_points'));
        $this->assertSame('dino-run', $result['standings'][0]['source_game_id']);
        $this->assertSame(1000, $result['standings'][0]['competition_points']);
        $this->assertSame(1, $result['standings'][0]['competition_rank']);
        $this->assertSame(0, $result['standings'][19]['competition_points']);
        $this->assertSame(1000, max(array_column($result['games'], 'competition_points')));
        $this->assertSame(0, min(array_column($result['games'], 'competition_points')));
        $this->assertSame($result, $s->calculate(self::WEEK,
            [...$first, ...$second], $this->samplePolicy()));
    }

    public function test_raw_score_ties_share_points_and_rank_but_display_order_is_deterministic(): void
    {
        $rows = [];
        $first = (string) Str::uuid();
        $second = (string) Str::uuid();
        $rows[] = $this->source('dino-run', $first, 500,
            '2026-11-10T10:00:02Z');
        $rows[] = $this->source('dino-run', $second, 500,
            '2026-11-10T10:00:01Z');
        for ($i = 2; $i < 20; $i++) {
            $rows[] = $this->source('dino-run', (string) Str::uuid(), 498 - $i);
        }
        $result = app(WeeklyFairScoringService::class)
            ->calculate(self::WEEK, $rows, $this->samplePolicy());
        $this->assertSame([$second, $first], array_slice(
            array_column($result['games'], 'player_id'), 0, 2));
        $this->assertSame([1, 1, 3], array_slice(
            array_column($result['games'], 'game_rank'), 0, 3));
        $this->assertSame([1000, 1000], array_slice(
            array_column($result['games'], 'competition_points'), 0, 2));
        $this->assertSame([1, 1, 3], array_slice(
            array_column($result['standings'], 'competition_rank'), 0, 3));
        $this->assertSame([1, 2, 3], array_slice(
            array_column($result['standings'], 'position'), 0, 3));
    }

    public function test_minimum_cohort_prevents_a_single_account_or_sparse_game_from_qualifying(): void
    {
        $service = app(WeeklyFairScoringService::class);
        $one = $service->calculate(self::WEEK,
            [$this->source('open-world', (string) Str::uuid(), 999999)],
            $this->samplePolicy());
        $this->assertSame(0, $one['games'][0]['competition_points']);
        $this->assertFalse($one['standings'][0]['qualified']);
        $nineteen = [];
        for ($i = 0; $i < 19; $i++) {
            $nineteen[] = $this->source('open-world', (string) Str::uuid(), 900 - $i);
        }
        $small = $service->calculate(self::WEEK, $nineteen, $this->samplePolicy());
        $this->assertSame(947, $small['games'][0]['competition_points']);
        $this->assertFalse($small['games'][0]['qualified']);
        $twenty = [...$nineteen, $this->source('open-world', (string) Str::uuid(), 0)];
        $complete = $service->calculate(self::WEEK, $twenty, $this->samplePolicy());
        $this->assertSame(1000, $complete['games'][0]['competition_points']);
        $this->assertTrue($complete['games'][0]['qualified']);
    }

    public function test_player_chooses_qualified_game_over_an_unqualified_high_provisional_result(): void
    {
        $same = (string) Str::uuid();
        $rows = [$this->source('dino-run', $same, 1)];
        for ($i = 1; $i < 20; $i++) {
            $rows[] = $this->source('dino-run', (string) Str::uuid(), 200 - $i);
        }
        $rows[] = $this->source('cafe-critters', $same, 1000000);
        for ($i = 1; $i < 19; $i++) {
            $rows[] = $this->source('cafe-critters', (string) Str::uuid(), 1000000 - $i);
        }
        $calc = app(WeeklyFairScoringService::class)
            ->calculate(self::WEEK, $rows, $this->samplePolicy());
        $mine = array_values(array_filter($calc['standings'],
            static fn (array $entry): bool => $entry['player_id'] === $same));
        $this->assertCount(1, $mine);
        $this->assertSame('dino-run', $mine[0]['source_game_id']);
        $this->assertTrue($mine[0]['qualified']);
        $this->assertSame(0, $mine[0]['competition_points']);
        $this->assertTrue($calc['standings'][0]['qualified']);
        $this->assertFalse(end($calc['standings'])['qualified']);
    }

    public function test_duplicate_player_game_best_or_mixed_rules_is_fail_closed(): void
    {
        $player = (string) Str::uuid();
        $first = $this->source('dino-run', $player, 150);
        $service = app(WeeklyFairScoringService::class);
        foreach ([
            [$first, $first],
            [$first, $this->source('dino-run', (string) Str::uuid(), 200,
                self::START, 'different-game-version')],
            [[...$first, 'score' => -1]],
            [[...$first, 'period_key' => 'weekly:tehran:2026-11-14']],
        ] as $sample) {
            try {
                $service->calculate(self::WEEK, $sample, $this->samplePolicy());
                $this->fail('Invalid score set was normalized without trusted integrity.');
            } catch (RuntimeException $expected) {
                $this->assertNotSame('', $expected->getMessage());
            }
        }
    }

    public function test_weekly_seal_atomically_persists_fair_points_without_mutating_prize_selection(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->verified($this->player(), 1000 - $i * 5);
        }
        $service = app(WeeklySettlementService::class);
        $this->assertSame('sealed', $service->seal('2026-11-07')['status']);
        $this->assertDatabaseCount('arcade_weekly_results', 20);
        $this->assertDatabaseCount('arcade_weekly_winners', 10);
        $this->assertDatabaseCount('arcade_weekly_fair_game_scores', 20);
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 20);
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertDatabaseHas('arcade_weekly_fair_policies', [
            'period_key' => self::WEEK,
            'algorithm_version' => WeeklyFairScoringService::VERSION,
            'result_count' => 20, 'qualified_count' => 20,
        ]);
        $policy = DB::table('arcade_weekly_fair_policies')->first();
        $this->assertSame(64, strlen($policy->source_snapshot_hash));
        $this->assertSame(64, strlen($policy->fair_snapshot_hash));
        $digest = $policy->fair_snapshot_hash;
        $this->assertSame('already_sealed', $service->seal('2026-11-07')['status']);
        $this->assertSame('already_scored',
            app(WeeklyFairScoringService::class)->backfillSealed(self::WEEK)['status']);
        $this->assertSame($digest,
            DB::table('arcade_weekly_fair_policies')->value('fair_snapshot_hash'));
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 20);
        $this->assertDatabaseCount('arcade_weekly_settlement_events', 1);
    }

    public function test_a_high_raw_score_from_a_different_game_does_not_inflate_global_points(): void
    {
        config()->set('demian-arcade.critters_ranked_enabled', true);
        for ($i = 0; $i < 20; $i++) {
            $person = $this->player();
            $this->verified($person, 500 - $i, 'dino-run', 'cafe-runner-v2');
            $this->verified($person, 1000000 - $i * 1000,
                'cafe-critters', 'critters-playtest-version');
        }
        $summary = app(WeeklySettlementService::class)->seal('2026-11-07');
        $this->assertSame(40, $summary['participants']);
        $this->assertSame(20, DB::table('arcade_weekly_fair_standings')->count());
        $this->assertSame(40, DB::table('arcade_weekly_fair_game_scores')->count());
        $this->assertSame(1000, (int) DB::table('arcade_weekly_fair_standings')
            ->orderBy('position')->value('competition_points'));
        // Equal normalized points in both games resolve to the stable game
        // identifier; raw score size does not influence cross-game ranking.
        $this->assertSame('cafe-critters',
            DB::table('arcade_weekly_fair_standings')
                ->where('position', 1)->value('source_game_id'));
        $this->assertSame(0, DB::table('arcade_coupons')->count());
        // Critters ranked scoring is intentionally separate from its
        // financial prize gate (OFF by default). The comparative table may
        // include both games, but only Dino Run's ten legacy winners remain.
        $this->assertFalse((bool) config('demian-arcade.critters_prizes_enabled'));
        $this->assertSame(10, DB::table('arcade_weekly_winners')->count());
        $this->assertSame(0, DB::table('arcade_weekly_winners')
            ->where('game_id', 'cafe-critters')->count());
    }

    public function test_public_api_is_read_only_and_discloses_only_finalized_verified_points(): void
    {
        $this->getJson('/api/v1/arcade/competition/fair/rules')->assertOk()
            ->assertJsonPath('maximum_points', 1000)
            ->assertJsonPath('minimum_cohort', 20)
            ->assertJsonPath('financial_awards_enabled', false);
        $this->getJson('/api/v1/arcade/competition/fair?week=2026-11-10')
            ->assertUnprocessable();
        $this->getJson('/api/v1/arcade/competition/fair?week=2026-11-07&limit=500')
            ->assertUnprocessable();
        $this->getJson('/api/v1/arcade/competition/fair?week=2026-11-07')
            ->assertOk()->assertJsonPath('status', 'not_finalized')
            ->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('arcade_weekly_fair_policies', 0);
        for ($i = 0; $i < 20; $i++) {
            $this->verified($this->player(), 900 - $i);
        }
        app(WeeklySettlementService::class)->seal('2026-11-07');
        $payload = $this->getJson('/api/v1/arcade/competition/fair?week=2026-11-07&limit=2')
            ->assertOk()
            ->assertJsonPath('status', 'finalized')
            ->assertJsonPath('participants', 20)
            ->assertJsonPath('data.0.competition_points', 1000)
            ->assertJsonPath('data.0.rank', 1)
            ->assertJsonCount(2, 'data')->json();
        $this->assertArrayNotHasKey('token', $payload);
        $this->assertArrayNotHasKey('coupons', $payload);
        $this->assertArrayNotHasKey('evidence', $payload);
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 20);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_historical_backfill_verifies_source_hash_then_recovers_separate_scores(): void
    {
        for ($i = 0; $i < 20; $i++) $this->verified($this->player(), 800 - $i);
        app(WeeklySettlementService::class)->seal('2026-11-07');
        $original = DB::table('arcade_weekly_fair_policies')->value('fair_snapshot_hash');
        DB::table('arcade_weekly_fair_standings')->delete();
        DB::table('arcade_weekly_fair_game_scores')->delete();
        DB::table('arcade_weekly_fair_policies')->delete();
        $this->artisan('arcade:fair-score', ['--week' => '2026-11-07'])
            ->assertFailed();
        $this->assertDatabaseCount('arcade_weekly_fair_policies', 0);
        $this->artisan('arcade:fair-score', ['--week' => '2026-11-07',
            '--apply' => true, '--json' => true])->assertSuccessful();
        $this->assertSame($original,
            DB::table('arcade_weekly_fair_policies')->value('fair_snapshot_hash'));
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 20);
        $this->assertDatabaseCount('arcade_weekly_settlement_events', 1);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_tampered_historical_source_never_generates_competitive_points_or_awards(): void
    {
        for ($i = 0; $i < 2; $i++) $this->verified($this->player(), 800 - $i);
        app(WeeklySettlementService::class)->seal('2026-11-07');
        DB::table('arcade_weekly_fair_standings')->delete();
        DB::table('arcade_weekly_fair_game_scores')->delete();
        DB::table('arcade_weekly_fair_policies')->delete();
        DB::table('arcade_weekly_results')->where('technical_rank', 1)
            ->update(['score' => 4294967295]);
        try {
            app(WeeklyFairScoringService::class)->backfillSealed(self::WEEK);
            $this->fail('Tampered historical technical ledger was accepted.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('hash mismatch', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_weekly_fair_policies', 0);
        $this->assertDatabaseCount('arcade_weekly_fair_standings', 0);
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_policy_is_frozen_at_week_creation_and_preparation_is_idempotent(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:29:00Z'));
        app(WeeklyCompetitionService::class)->prepare();
        $this->assertDatabaseCount('arcade_weekly_fair_policies', 2);
        app(WeeklyCompetitionService::class)->prepare();
        $this->assertDatabaseCount('arcade_weekly_fair_policies', 2);
        $this->assertDatabaseHas('arcade_weekly_fair_policies', [
            'period_key' => 'weekly:tehran:2026-11-14',
            'algorithm_version' => WeeklyFairScoringService::VERSION,
            'maximum_points' => 1000,
            'minimum_cohort' => 20,
        ]);
        DB::table('arcade_weekly_fair_policies')
            ->where('period_key', 'weekly:tehran:2026-11-14')
            ->update(['algorithm_version' => 'unsafe-reweight-v9']);
        try {
            app(WeeklyCompetitionService::class)->prepare();
            $this->fail('Changed frozen scoring policy was silently accepted.');
        } catch (RuntimeException $expected) {
            $this->assertStringContainsString('frozen', $expected->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_account_erasure_anonymizes_historical_fair_results_and_public_response(): void
    {
        $owner = $this->player();
        $this->verified($owner, 500);
        app(WeeklySettlementService::class)->seal('2026-11-07');
        DB::table('arcade_players')->where('id', $owner)->delete();
        $this->assertDatabaseHas('arcade_weekly_fair_standings', [
            'period_key' => self::WEEK,
            'player_id' => null,
            'run_id' => null,
        ]);
        $this->getJson('/api/v1/arcade/competition/fair?week=2026-11-07')
            ->assertOk()->assertJsonCount(0, 'data');
    }
}
