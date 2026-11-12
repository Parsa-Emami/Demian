<?php

namespace Tests\Feature;

use App\Services\Arcade\LeaderboardService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class WeeklyLeaderboardContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_week_changes_at_saturday_midnight_tehran_not_utc_midnight(): void
    {
        $before = CarbonImmutable::parse('2026-11-13T20:29:59+00:00');
        $after = $before->addSecond();

        $this->assertSame('weekly:tehran:2026-11-07', LeaderboardService::periodKeys($before)[2]);
        $this->assertSame('weekly:tehran:2026-11-14', LeaderboardService::periodKeys($after)[2]);
        $this->assertSame('daily:2026-11-13', LeaderboardService::periodKeys($after)[1]);
    }

    public function test_year_crossing_keeps_season_key_based_on_tehran_saturday(): void
    {
        $december = CarbonImmutable::parse('2026-12-31T23:00:00+03:30');
        $january = CarbonImmutable::parse('2027-01-01T01:30:00+03:30');

        $this->assertSame('weekly:tehran:2026-12-26', LeaderboardService::periodKeys($december)[2]);
        $this->assertSame('weekly:tehran:2026-12-26', LeaderboardService::periodKeys($january)[2]);
    }

    public function test_public_endpoint_defaults_to_weekly_and_reports_exact_utc_boundaries(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-13T20:30:00+00:00'));

        $this->getJson('/api/v1/arcade/leaderboards/dino-run')
            ->assertOk()
            ->assertJsonPath('period', 'weekly')
            ->assertJsonPath('period_key', 'weekly:tehran:2026-11-14')
            ->assertJsonPath('season.id', 'weekly:tehran:2026-11-14')
            ->assertJsonPath('season.timezone', 'Asia/Tehran')
            ->assertJsonPath('season.starts_at', '2026-11-13T20:30:00+00:00')
            ->assertJsonPath('season.ends_at', '2026-11-20T20:30:00+00:00')
            ->assertJsonCount(0, 'data');
    }

    public function test_previous_periods_remain_distinct_and_do_not_require_deleting_rows(): void
    {
        $first = CarbonImmutable::parse('2026-11-07T01:00:00+03:30');
        $second = CarbonImmutable::parse('2026-11-14T01:00:00+03:30');

        $this->assertNotSame(LeaderboardService::periodKeys($first)[2], LeaderboardService::periodKeys($second)[2]);
        $this->assertSame('all', LeaderboardService::periodKeys($second)[0]);
    }
}
