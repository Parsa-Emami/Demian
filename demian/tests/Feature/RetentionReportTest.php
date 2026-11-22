<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Services\Arcade\RetentionReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class RetentionReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_uses_verified_runs_and_tehran_days_without_exposing_identity(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 17)->setTime(12, 0));
        $player = ArcadePlayer::query()->create(['display_name' => 'Private Name', 'token_hash' => hash('sha256', 'secret'),
            'token_expires_at' => now()->addDays(30)]);
        $player->forceFill(['created_at' => '2026-11-01 21:00:00'])->save();
        foreach (['verified', 'started'] as $status) DB::table('arcade_runs')->insert([
            'id' => (string) Str::uuid(), 'player_id' => $player->id, 'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run', 'rules_version' => 'fixture', 'character_slug' => 'darya',
            'seed' => 1, 'track_width' => 420, 'status' => $status,
            'started_at' => $status === 'verified' ? '2026-11-02 21:00:00' : '2026-11-08 21:00:00',
            'expires_at' => '2026-11-09 23:00:00', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $report = app(RetentionReport::class)->snapshot();
        $this->assertSame('2026-11-02', $report['cohorts'][0]['joined']);
        $this->assertSame(100.0, $report['cohorts'][0]['d1']['percent']);
        $this->assertSame(0.0, $report['cohorts'][0]['d7']['percent']);
        $this->assertStringNotContainsString($player->id, json_encode($report));
        $this->assertStringNotContainsString('Private Name', json_encode($report));
    }
}
