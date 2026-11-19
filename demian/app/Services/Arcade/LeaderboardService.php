<?php

namespace App\Services\Arcade;

use Carbon\CarbonInterface;
use Domain\Arcade\WeeklyContent;
use Illuminate\Support\Facades\DB;

final class LeaderboardService
{
    public static function periodKeys(CarbonInterface $date): array
    {
        return CompetitionClock::periodKeys($date);
    }

    public function read(string $period, int $limit): array
    {
        return $this->readForGame('dino-run', $period, $limit);
    }

    public function readForGame(string $gameId, string $period, int $limit): array
    {
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($gameId), 404);
        $rulesVersion = match ($gameId) {
            'cafe-drift' => CafeDriftReplayVerifier::VERSION,
            'cafe-critters' => WeeklyContent::effectiveVersion($gameId, CafeCrittersReplayVerifier::VERSION, now(), config('demian-arcade.weekly_content_at')),
            'coffee-crash' => WeeklyContent::effectiveVersion($gameId, CoffeeCrashReplayVerifier::VERSION, now(), config('demian-arcade.weekly_content_at')),
            'after-hours' => config('demian-arcade.gameplay_ranked_enabled.after-hours')
                ? WeeklyContent::effectiveVersion($gameId, AfterHoursFrameReplayVerifier::VERSION, now(), config('demian-arcade.weekly_content_at')) : CafeRouteReplayVerifier::VERSIONS[$gameId],
            'cafe-rush' => config('demian-arcade.gameplay_ranked_enabled.cafe-rush')
                ? WeeklyContent::effectiveVersion($gameId, CafeRushFrameReplayVerifier::VERSION, now(), config('demian-arcade.weekly_content_at')) : CafeRouteReplayVerifier::VERSIONS[$gameId],
            'open-world' => WeeklyContent::effectiveVersion($gameId, CafeRouteReplayVerifier::VERSIONS[$gameId], now(), config('demian-arcade.weekly_content_at')),
            default => app(RunnerReplayVerifier::class)->versionAt(now()),
        };
        $window = app(CompetitionClock::class)->snapshot($period);
        $key = $window['period_key'];
        $rows = DB::table('arcade_leaderboard_entries as e')->join('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->join('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->where('e.game_id', $gameId)->where('e.rules_version', $rulesVersion)->where('e.period_key', $key)
            ->orderByDesc('e.score')->orderBy('e.achieved_at')->orderBy('e.id')->limit($limit)
            ->get(['p.id as player_id', 'p.display_name', 'e.score', 'e.achieved_at', 'r.character_slug', 'r.track_width', 'r.ticks', 'r.passed']);

        return ['game_id' => $gameId, ...$window,
            'rules_version' => $rulesVersion, 'verification' => 'server-replay',
            'data' => $rows->map(fn (object $row, int $i): array => ['rank' => $i + 1, 'player_id' => $row->player_id,
                'display_name' => $row->display_name, 'score' => (int) $row->score,
                'character_slug' => $row->character_slug, 'track_width' => (int) $row->track_width,
                'ticks' => (int) $row->ticks, 'passed' => (int) $row->passed, 'achieved_at' => $row->achieved_at])->all()];
    }
}
