<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Step 13: read-only weekly comparative standings and an owner-only rank.
 *
 * The live view is an expressly PROVISIONAL, bounded projection of existing
 * server-verified per-game personal bests. Finalized weeks use only the frozen
 * Step 12 snapshot. Neither path allocates prizes or writes to the ledger.
 */
final class WeeklyLeaderboardReadService
{
    private const MAX_SOURCE_ROWS = 5000;
    private const HISTORY_WEEKS = 12;

    public function __construct(
        private readonly WeeklyFairScoringService $fair,
        private readonly WeeklyCompetitionService $competition,
    ) {}

    private function window(?string $localSaturday = null): array
    {
        $current = $this->competition->window(CarbonImmutable::now('UTC'));
        $key = $localSaturday === null
            ? $current['period_key'] : 'weekly:tehran:'.$localSaturday;
        $start = $this->fair->validatePeriodKey($key)->utc();
        // Only current and 52 historical weeks are publicly queryable;
        // no unbounded date scans, future previews or forged week boundaries.
        if ($start->gt($current['starts_at'])
            || $start->lt($current['starts_at']->subWeeks(52))) {
            throw new InvalidArgumentException('Week is outside the available competition history.');
        }
        return $this->competition->window($start);
    }

    public function weeks(): array
    {
        $current = $this->competition->window(CarbonImmutable::now('UTC'));
        $keys = DB::table('arcade_weekly_periods')
            ->where('period_key', 'like', 'weekly:tehran:%')
            ->where('period_key', '<=', $current['period_key'])
            ->where('period_key', '>=', 'weekly:tehran:'.$current['starts_at']
                ->subWeeks(52)->setTimezone('Asia/Tehran')->format('Y-m-d'))
            ->orderByDesc('period_key')->limit(self::HISTORY_WEEKS)->pluck('period_key')->all();
        $keys = array_values(array_unique([$current['period_key'], ...$keys]));
        $keys = array_slice($keys, 0, self::HISTORY_WEEKS);
        return array_map(function (string $key) use ($current): array {
            $period = DB::table('arcade_weekly_periods')
                ->where('period_key', $key)->first(['status', 'starts_at', 'ends_at']);
            return [
                'period_key' => $key,
                'week' => substr($key, strlen('weekly:tehran:')),
                'status' => $key === $current['period_key']
                    ? 'current' : ($period?->status === 'sealed' ? 'finalized' : 'closing'),
            ];
        }, $keys);
    }

    public function read(?string $week = null, int $limit = 20, ?string $ownerId = null): array
    {
        if ($limit < 1 || $limit > 50) {
            throw new InvalidArgumentException('Invalid leaderboard limit.');
        }
        $window = $this->window($week);
        $key = $window['period_key'];
        $now = CarbonImmutable::now('UTC');
        $period = DB::table('arcade_weekly_periods')->where('period_key', $key)->first();
        $currentKey = $this->competition->window($now)['period_key'];
        $clock = [
            'period_key' => $key,
            'starts_at' => $window['starts_at']->toIso8601String(),
            'next_reset_at' => $window['ends_at']->toIso8601String(),
            'timezone' => 'Asia/Tehran',
            'server_time' => $now->toIso8601String(),
            'is_current' => $key === $currentKey,
        ];

        if ($period && $period->status === 'sealed') {
            $published = $this->fair->publicRead($key, $limit);
            if ($published['status'] !== 'finalized') {
                // Historical data without the audited parallel fair snapshot
                // must not be served as live data or silently reweighted.
                return [...$clock, 'status' => 'archive_pending', 'data' => [],
                    'participants' => 0, 'my_rank' => null, 'my_best' => null,
                    'rules' => $this->fair->rules()];
            }
            $mine = $ownerId ? DB::table('arcade_weekly_fair_standings')
                ->where('period_key', $key)->where('player_id', $ownerId)->first() : null;
            return [
                ...$clock,
                'status' => 'finalized',
                'verification' => 'sealed-server-replay',
                'algorithm_version' => $published['algorithm_version'],
                'snapshot_hash' => $published['snapshot_hash'],
                'participants' => $published['participants'],
                'qualified_participants' => $published['qualified_participants'],
                'rules' => $published['rules'],
                'games' => $published['games'],
                'data' => $published['data'],
                'my_rank' => $mine ? (int) $mine->competition_rank : null,
                'my_best' => $mine ? $this->personal($mine) : null,
            ];
        }

        if ($key !== $currentKey) {
            return [...$clock, 'status' => 'archive_pending', 'data' => [],
                'participants' => 0, 'my_rank' => null, 'my_best' => null,
                'rules' => $this->fair->rules()];
        }

        $source = $this->verifiedCurrentEntries($window);
        $frozen = (object) [
            'algorithm_version' => WeeklyFairScoringService::VERSION,
            'maximum_points' => WeeklyFairScoringService::MAX_POINTS,
            'minimum_cohort' => WeeklyFairScoringService::MIN_COHORT,
        ];
        $normalized = $this->fair->calculate($key, $source, $frozen);
        $all = $normalized['standings'];
        $ids = array_column($all, 'player_id');
        $names = $ids ? DB::table('arcade_players')
            ->whereIn('id', $ids)->pluck('display_name', 'id')->all() : [];
        // A concurrently deleted account must not remain in the public view.
        $visible = array_values(array_filter($all, static fn (array $row): bool =>
            isset($names[$row['player_id']])));
        $data = array_map(static fn (array $row): array => [
            'rank' => $row['competition_rank'],
            'position' => $row['position'],
            'player_id' => $row['player_id'],
            'display_name' => $names[$row['player_id']],
            'source_game_id' => $row['source_game_id'],
            'competition_points' => $row['competition_points'],
            'cohort_size' => $row['cohort_size'],
            'qualified' => (bool) $row['qualified'],
            'achieved_at' => $row['achieved_at'],
        ], array_slice($visible, 0, $limit));
        $mine = null;
        if ($ownerId !== null) {
            foreach ($visible as $row) {
                if ($row['player_id'] === $ownerId) {
                    $mine = $row;
                    break;
                }
            }
        }
        return [
            ...$clock,
            'status' => 'live_preview',
            'verification' => 'verified-server-replay-provisional',
            'algorithm_version' => WeeklyFairScoringService::VERSION,
            // The preview is recalculated as runs arrive; never claim a final
            // hash or guarantee that present positions will receive prizes.
            'snapshot_hash' => null,
            'participants' => count($visible),
            'qualified_participants' => count(array_filter($visible,
                static fn (array $row): bool => $row['qualified'])),
            'rules' => $this->fair->rules(),
            'data' => $data,
            'my_rank' => $mine['competition_rank'] ?? null,
            'my_best' => $mine ? [
                'source_game_id' => $mine['source_game_id'],
                'competition_points' => $mine['competition_points'],
                'cohort_size' => $mine['cohort_size'],
                'qualified' => (bool) $mine['qualified'],
                'achieved_at' => $mine['achieved_at'],
            ] : null,
        ];
    }

    private function personal(object $row): array
    {
        return [
            'source_game_id' => $row->source_game_id,
            'competition_points' => (int) $row->competition_points,
            'cohort_size' => (int) $row->cohort_size,
            'qualified' => (bool) $row->qualified,
            'achieved_at' => $row->achieved_at,
        ];
    }

    /**
     * Bounded read of server-verified scores only. No write and no
     * unverified local/client submissions. A corrupt best fails CLOSED.
     */
    private function verifiedCurrentEntries(array $week): array
    {
        $key = $week['period_key'];
        $rows = DB::table('arcade_leaderboard_entries as e')
            ->join('arcade_runs as r', 'r.id', '=', 'e.run_id')
            ->join('arcade_players as p', 'p.id', '=', 'e.player_id')
            ->where('e.period_key', $key)
            ->where('r.status', 'verified')
            ->whereNotNull('r.replay_hash')
            ->whereNotNull('r.completed_at')
            ->where('r.started_at', '>=', $week['starts_at']->toDateTimeString())
            ->where('r.started_at', '<', $week['ends_at']->toDateTimeString())
            ->limit(self::MAX_SOURCE_ROWS + 1)
            ->get([
                'e.player_id', 'e.game_id', 'e.rules_version',
                'e.run_id', 'e.score', 'e.achieved_at',
                'r.player_id as run_player_id',
                'r.game_id as run_game_id',
                'r.rules_version as run_rules_version',
                'r.score as run_score', 'r.started_at',
            ]);
        if ($rows->count() > self::MAX_SOURCE_ROWS) {
            throw new RuntimeException('Weekly leaderboard exceeds bounded preview capacity.');
        }
        $ruleLocks = DB::table('arcade_weekly_rule_locks')
            ->where('period_key', $key)->get()->keyBy('game_id');
        $catalog = app(RankedGameCatalog::class);
        $result = [];
        foreach ($rows as $row) {
            $lock = $ruleLocks->get($row->game_id);
            if (($lock && (! (bool) $lock->ranked_enabled
                    || $lock->rules_version !== $row->rules_version))
                || (! $lock && ! $catalog->supportsRanked($row->game_id))
                || $row->player_id !== $row->run_player_id
                || $row->game_id !== $row->run_game_id
                || $row->rules_version !== $row->run_rules_version
                || (int) $row->score !== (int) $row->run_score
                || CarbonImmutable::parse($row->achieved_at, 'UTC')->getTimestamp()
                    !== CarbonImmutable::parse($row->started_at, 'UTC')->getTimestamp()) {
                throw new RuntimeException('Unverified or inconsistent weekly leaderboard entry.');
            }
            $result[] = [
                'period_key' => $key,
                'player_id' => $row->player_id,
                'game_id' => $row->game_id,
                'rules_version' => $row->rules_version,
                'run_id' => $row->run_id,
                'score' => (int) $row->score,
                'achieved_at' => $row->achieved_at,
            ];
        }
        return $result;
    }
}
