<?php

namespace App\Services\Arcade;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

final class LeaderboardService
{
    public static function periodKeys(CarbonInterface $date): array
    {
        return CompetitionClock::periodKeys($date);
    }

    public function read(string $period, int $limit): array
    {
        $rules = app(RunnerReplayVerifier::class)->rules();
        $window = app(CompetitionClock::class)->snapshot($period);
        $key = $window['period_key'];
        $rows = DB::table('arcade_leaderboard_entries as e')->join('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->join('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->where('e.game_id', 'dino-run')->where('e.rules_version', $rules['version'])->where('e.period_key', $key)
            ->orderByDesc('e.score')->orderBy('e.achieved_at')->orderBy('e.id')->limit($limit)
            ->get(['p.id as player_id', 'p.display_name', 'e.score', 'e.achieved_at', 'r.character_slug', 'r.track_width']);

        return ['game_id' => 'dino-run', ...$window,
            'rules_version' => $rules['version'], 'verification' => 'server-replay',
            'data' => $rows->map(fn (object $row, int $i): array => ['rank' => $i + 1, 'player_id' => $row->player_id,
                'display_name' => $row->display_name, 'score' => (int) $row->score,
                'character_slug' => $row->character_slug, 'track_width' => (int) $row->track_width,
                'achieved_at' => $row->achieved_at])->all()];
    }
}
