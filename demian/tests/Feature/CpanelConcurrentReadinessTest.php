<?php

namespace Tests\Feature;

use App\Models\ArcadeRun;
use App\Services\Arcade\RunnerReplayVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CpanelConcurrentReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_fifty_players_on_the_same_nat_ip_can_register_without_spurious_429(): void
    {
        $tokens = [];
        for ($i = 0; $i < 50; $i++) {
            $response = $this->postJson('/api/v1/arcade/players',
                ['display_name' => 'Player '.$i])->assertCreated()->json();
            $tokens[] = $response['token'];
        }

        $this->assertDatabaseCount('arcade_players', 50);
        $this->assertCount(50, array_unique($tokens));
    }

    public function test_fifty_authenticated_players_on_one_ip_have_isolated_run_budgets(): void
    {
        $version = app(RunnerReplayVerifier::class)->rules()['version'];
        $players = [];
        for ($i = 0; $i < 50; $i++) {
            $players[] = $this->postJson('/api/v1/arcade/players',
                ['display_name' => 'Guest '.$i])->assertCreated()->json();
        }
        foreach ($players as $player) {
            $this->withToken($player['token'])->postJson('/api/v1/arcade/runs', [
                'request_id' => (string) Str::uuid(),
                'game_id' => 'dino-run', 'rules_version' => $version,
                'character_slug' => 'darya', 'track_width' => 420,
            ])->assertCreated();
        }

        $this->assertDatabaseCount('arcade_runs', 50);
    }

    public function test_ranked_index_exists_with_descending_score_order(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $row = collect(DB::select("PRAGMA index_list('arcade_leaderboard_entries')"))
                ->first(fn ($index) => $index->name === 'arcade_rank_order_v2');
            $this->assertNotNull($row);
            $columns = DB::select("PRAGMA index_xinfo('arcade_rank_order_v2')");
            $score = collect($columns)->first(fn ($column) => $column->name === 'score');
            $this->assertNotNull($score);
            $this->assertSame(1, (int) $score->desc);
        } else {
            $rows = DB::select("SHOW INDEX FROM arcade_leaderboard_entries WHERE Key_name = 'arcade_rank_order_v2'");
            $this->assertCount(6, $rows);
            $score = collect($rows)->first(fn ($row) => $row->Column_name === 'score');
            $this->assertSame('D', $score->Collation);
        }
    }
}
