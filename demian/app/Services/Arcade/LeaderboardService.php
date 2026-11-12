<?php

namespace App\Services\Arcade;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

final class LeaderboardService
{
    public static function periodKeys(CarbonInterface $date): array
    {
        $utc = $date->copy()->utc();
        $seasonStart = $utc->copy()
            ->setTimezone(config('demian-arcade.season_timezone', 'Asia/Tehran'))
            ->startOfWeek((int) config('demian-arcade.season_week_start_day', 6))
            ->startOfDay();

        return ['all', 'daily:'.$utc->format('Y-m-d'), 'weekly:tehran:'.$seasonStart->format('Y-m-d')];
    }

    public function read(string $period, int $limit): array
    {
        $rules = app(RunnerReplayVerifier::class)->rules();
        $index = ['all' => 0, 'daily' => 1, 'weekly' => 2][$period];
        $serverNow = now();
        $key = self::periodKeys($serverNow)[$index];
        $timezone = config('demian-arcade.season_timezone', 'Asia/Tehran');
        $weekStart = $serverNow->copy()->setTimezone($timezone)
            ->startOfWeek((int) config('demian-arcade.season_week_start_day', 6))
            ->startOfDay();
        $rows = DB::table('arcade_leaderboard_entries as e')->join('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->join('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->where('e.game_id', 'dino-run')->where('e.rules_version', $rules['version'])->where('e.period_key', $key)
            ->orderByDesc('e.score')->orderBy('e.achieved_at')->orderBy('e.id')->limit($limit)
            ->get(['p.id as player_id', 'p.display_name', 'e.score', 'e.achieved_at', 'r.character_slug', 'r.track_width']);

        return ['game_id' => 'dino-run', 'period' => $period, 'period_key' => $key,
            'rules_version' => $rules['version'], 'verification' => 'server-replay',
            'timezone' => $period === 'weekly' ? $timezone : 'UTC',
            'server_now' => $serverNow->copy()->utc()->toIso8601String(),
            'season' => $period === 'weekly' ? [
                'id' => $key,
                'starts_at' => $weekStart->copy()->utc()->toIso8601String(),
                'ends_at' => $weekStart->copy()->addWeek()->utc()->toIso8601String(),
                'timezone' => $timezone,
            ] : null,
            'data' => $rows->map(fn (object $row, int $i): array => ['rank' => $i + 1, 'player_id' => $row->player_id,
                'display_name' => $row->display_name, 'score' => (int) $row->score,
                'character_slug' => $row->character_slug, 'track_width' => (int) $row->track_width,
                'achieved_at' => $row->achieved_at])->all()];
    }
}
