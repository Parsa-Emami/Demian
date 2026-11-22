<?php

namespace App\Services\Arcade;

use Carbon\CarbonInterface;
use Domain\Arcade\WeeklyContent;
use Illuminate\Database\Query\Builder;
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

    private function rulesVersion(string $gameId, CarbonInterface $at): string
    {
        abort_unless(app(RankedGameCatalog::class)->supportsRanked($gameId), 404);
        return match ($gameId) {
            'cafe-drift' => CafeDriftReplayVerifier::VERSION,
            'cafe-critters' => WeeklyContent::effectiveVersion($gameId, CafeCrittersReplayVerifier::VERSION, $at, config('demian-arcade.weekly_content_at')),
            'coffee-crash' => WeeklyContent::effectiveVersion($gameId, CoffeeCrashReplayVerifier::VERSION, $at, config('demian-arcade.weekly_content_at')),
            'after-hours' => config('demian-arcade.gameplay_ranked_enabled.after-hours')
                ? WeeklyContent::effectiveVersion($gameId, AfterHoursFrameReplayVerifier::VERSION, $at, config('demian-arcade.weekly_content_at')) : CafeRouteReplayVerifier::VERSIONS[$gameId],
            'cafe-rush' => config('demian-arcade.gameplay_ranked_enabled.cafe-rush')
                ? WeeklyContent::effectiveVersion($gameId, CafeRushFrameReplayVerifier::VERSION, $at, config('demian-arcade.weekly_content_at')) : CafeRouteReplayVerifier::VERSIONS[$gameId],
            'open-world' => WeeklyContent::effectiveVersion($gameId, CafeRouteReplayVerifier::VERSIONS[$gameId], $at, config('demian-arcade.weekly_content_at')),
            default => app(RunnerReplayVerifier::class)->versionAt($at),
        };
    }

    private function entries(string $gameId, string $rulesVersion, string $periodKey): Builder
    {
        return DB::table('arcade_leaderboard_entries as e')
            ->join('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->join('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->where('e.game_id', $gameId)->where('e.rules_version', $rulesVersion)->where('e.period_key', $periodKey)
            ->where('r.status', 'verified')->whereNotNull('r.replay_hash')
            ->whereColumn('r.game_id', 'e.game_id')->whereColumn('r.rules_version', 'e.rules_version')
            ->whereColumn('r.player_id', 'e.player_id')->whereColumn('r.score', 'e.score');
    }

    private function tieColumn(string $gameId): string
    {
        return $gameId === CafeDriftReplayVerifier::GAME_ID ? 'e.player_id' : 'e.id';
    }

    public function readForGame(string $gameId, string $period, int $limit): array
    {
        $at = now();
        $rulesVersion = $this->rulesVersion($gameId, $at);
        $window = app(CompetitionClock::class)->snapshot($period, $at);
        $key = $window['period_key'];
        $rows = $this->entries($gameId, $rulesVersion, $key)
            ->orderByDesc('e.score')->orderBy('e.achieved_at')->orderBy($this->tieColumn($gameId))->limit($limit)
            ->get(['p.id as player_id', 'p.display_name', 'e.score', 'e.achieved_at', 'r.character_slug', 'r.track_width', 'r.ticks', 'r.passed']);

        $competition = $gameId === CafeDriftReplayVerifier::GAME_ID && $period === 'weekly'
            ? $this->driftCompetition($key, $at) : null;

        return ['game_id' => $gameId, ...$window, ...($competition ? ['competition' => $competition] : []),
            'rules_version' => $rulesVersion, 'verification' => 'server-replay',
            'data' => $rows->map(fn (object $row, int $i): array => ['rank' => $i + 1, 'player_id' => $row->player_id,
                'display_name' => $row->display_name, 'score' => (int) $row->score,
                'character_slug' => $row->character_slug, 'track_width' => (int) $row->track_width,
                'ticks' => (int) $row->ticks, 'passed' => (int) $row->passed, 'achieved_at' => $row->achieved_at])->all()];
    }

    public function driftArchive(string $week, int $limit, ?string $owner = null): array
    {
        try {
            $window = app(WeeklyLeaderboardReadService::class)->window($week);
        } catch (\InvalidArgumentException $error) {
            abort(422, $error->getMessage());
        }
        $key = $window['period_key'];
        $final = DB::table('arcade_weekly_periods')->where('period_key', $key)
            ->where('status', 'sealed')->first(['snapshot_hash']);
        $status = $final && preg_match('/^[a-f0-9]{64}$/D', (string) $final->snapshot_hash)
            ? 'finalized' : 'archive_pending';
        $result = [
            'game_id' => CafeDriftReplayVerifier::GAME_ID, 'period' => 'weekly', 'period_key' => $key,
            'timezone' => 'Asia/Tehran', 'starts_at' => $window['starts_at']->toIso8601String(),
            'next_reset_at' => $window['ends_at']->toIso8601String(), 'server_time' => now()->toIso8601String(),
            'status' => $status, 'is_current' => false, 'verification' => 'sealed-server-replay',
            'rules_version' => CafeDriftReplayVerifier::VERSION, 'data' => [],
            'my_rank' => null, 'best' => null, 'participants' => 0,
        ];
        if ($status !== 'finalized') return $result;

        $query = DB::table('arcade_weekly_results as r')->where('r.period_key', $key)
            ->where('r.game_id', CafeDriftReplayVerifier::GAME_ID);
        $result['participants'] = (clone $query)->count();
        if ($owner !== null) {
            $own = $query->where('r.player_id', $owner)->first();
            $result['my_rank'] = $own ? (int) $own->technical_rank : null;
            $result['best'] = $own ? ['score' => (int) $own->score, 'achieved_at' => $own->achieved_at] : null;
            return $result;
        }

        $result['data'] = $query->leftJoin('arcade_players as p', 'p.id', '=', 'r.player_id')
            ->orderBy('r.technical_rank')->limit($limit)
            ->get(['r.technical_rank', 'r.score', 'r.achieved_at', 'p.id as player_id', 'p.display_name'])
            ->map(static fn (object $row): array => [
                'rank' => (int) $row->technical_rank, 'score' => (int) $row->score,
                'achieved_at' => $row->achieved_at, 'player_id' => $row->player_id,
                'display_name' => $row->display_name ?? 'بازیکن حذف‌شده',
            ])->all();
        return $result;
    }

    private function driftCompetition(string $key, CarbonInterface $at): array
    {
        $schedule = app(WeeklyCompetitionService::class)->describe($at, $at);
        $lock = DB::table('arcade_weekly_rule_locks')->where('period_key', $key)
            ->where('game_id', CafeDriftReplayVerifier::GAME_ID)->first();
        $eligible = ($lock === null || ((bool) $lock->ranked_enabled && (bool) $lock->prize_eligible))
            && app(RankedGameCatalog::class)->supportsPrizes(CafeDriftReplayVerifier::GAME_ID);
        $campaign = $eligible && DB::table('arcade_reward_campaigns')->where('period_key', $key)
            ->where('status', 'active')->exists();

        return [
            'status' => $schedule['status'],
            'new_starts_close_at' => $schedule['new_starts_close_at'],
            'completion_deadline_at' => $schedule['completion_deadline_at'],
            'accepting_starts' => $schedule['seconds_until_start_cutoff'] > 0,
            'prizes' => $campaign ? 'campaign_active' : ($eligible ? 'campaign_pending' : 'unavailable'),
        ];
    }

    public function personal(string $gameId, string $period, string $playerId): array
    {
        $at = now();
        $version = $this->rulesVersion($gameId, $at);
        $window = app(CompetitionClock::class)->snapshot($period, $at);
        $scope = $this->entries($gameId, $version, $window['period_key']);
        $tie = $this->tieColumn($gameId);
        $entry = (clone $scope)->where('e.player_id', $playerId)
            ->first(['e.score', 'e.achieved_at', $tie.' as tie_key']);
        $participants = (clone $scope)->count();
        $rank = null;
        $next = null;
        if ($entry) {
            $ahead = (clone $scope)->where(function ($query) use ($entry, $tie): void {
                $query->where('e.score', '>', $entry->score)
                    ->orWhere(function ($sameScore) use ($entry, $tie): void {
                        $sameScore->where('e.score', $entry->score)
                            ->where(function ($earlier) use ($entry, $tie): void {
                                $earlier->where('e.achieved_at', '<', $entry->achieved_at)
                                    ->orWhere(function ($sameTime) use ($entry, $tie): void {
                                        $sameTime->where('e.achieved_at', $entry->achieved_at)
                                            ->where($tie, '<', $entry->tie_key);
                                    });
                            });
                    });
            });
            $rank = (clone $ahead)->count() + 1;
            $next = $ahead->orderBy('e.score')->orderByDesc('e.achieved_at')->orderByDesc($tie)->value('e.score');
        }

        return [
            'game_id' => $gameId, ...$window, 'rules_version' => $version,
            'my_rank' => $rank, 'participants' => $participants,
            'best' => $entry ? ['score' => (int) $entry->score, 'achieved_at' => $entry->achieved_at] : null,
            'points_to_overtake' => $next !== null ? (int) $next - (int) $entry->score + 1 : null,
        ];
    }
}
