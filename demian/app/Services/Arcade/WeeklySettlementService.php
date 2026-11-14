<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * An auditable snapshot, never a discount issuer.
 *
 * Lock order: settlement locks the period row; score completion locks the
 * player/run then the SAME period row before publishing weekly scores.
 * A period is not sealed while a started run can still complete.
 */
final class WeeklySettlementService
{
    public function __construct(private readonly WeeklyPrizeSelector $selector) {}

    public function week(CarbonInterface $when): array
    {
        $start = CarbonImmutable::instance($when)->setTimezone('Asia/Tehran')
            ->startOfWeek(CarbonImmutable::SATURDAY);
        $end = $start->addWeek();

        return [
            'period_key' => CompetitionClock::periodKeys($start)[2],
            'starts_at' => $start->utc(),
            'ends_at' => $end->utc(),
        ];
    }

    /**
     * Make the period row available to completion/settlement as a shared lock.
     * The insert is atomic, even for historic runs made before this migration.
     */
    public function ensurePeriod(CarbonInterface $started): string
    {
        $window = $this->week($started);
        DB::table('arcade_weekly_periods')->insertOrIgnore([
            'period_key' => $window['period_key'],
            'starts_at' => $window['starts_at']->toDateTimeString(),
            'ends_at' => $window['ends_at']->toDateTimeString(),
            'status' => 'open',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $window['period_key'];
    }

    /** Must be called in the same transaction as publishing a verified score. */
    public function assertOpenForCompletion(CarbonInterface $started): void
    {
        $key = $this->ensurePeriod($started);
        $period = DB::table('arcade_weekly_periods')->where('period_key', $key)->lockForUpdate()->first();
        abort_unless($period && $period->status === 'open', 409, 'Weekly results are sealed.');
    }

    /** Settle a specified Saturday in Asia/Tehran; idempotent after sealing. */
    public function seal(string $localSaturday, ?CarbonInterface $at = null): array
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $localSaturday)) {
            throw new InvalidArgumentException('Week must be a YYYY-MM-DD Tehran Saturday.');
        }
        try {
            $startLocal = CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $localSaturday.' 00:00:00', 'Asia/Tehran');
        } catch (\Throwable $e) {
            throw new InvalidArgumentException('Invalid week start date.', 0, $e);
        }
        if (! $startLocal || $startLocal->format('Y-m-d') !== $localSaturday
            || $startLocal->dayOfWeek !== CarbonImmutable::SATURDAY) {
            throw new InvalidArgumentException('Week must start on Saturday in Tehran.');
        }
        $window = $this->week($startLocal);
        $utcNow = $at ? CarbonImmutable::instance($at)->utc() : CarbonImmutable::now('UTC');
        if ($utcNow->lt($window['ends_at'])) {
            throw new RuntimeException('Cannot seal a week before its Tehran closing boundary.');
        }

        return DB::transaction(function () use ($startLocal, $utcNow, $window): array {
            $key = $this->ensurePeriod($startLocal);
            $period = DB::table('arcade_weekly_periods')->where('period_key', $key)->lockForUpdate()->first();
            if (! $period || ! in_array($period->status, ['open', 'sealed'], true)) {
                throw new RuntimeException('Unknown weekly period state.');
            }
            if ($period->status === 'sealed') {
                return ['period_key' => $key, 'status' => 'already_sealed',
                    'participants' => (int) $period->participants, 'winners' => (int) $period->winner_count];
            }

            // A run started just before rollover may validly finish afterwards.
            // No snapshot is published until that possibility has expired.
            $unfinished = DB::table('arcade_runs')
                ->where('started_at', '>=', $window['starts_at']->toDateTimeString())
                ->where('started_at', '<', $window['ends_at']->toDateTimeString())
                ->where('status', 'started')
                ->where('expires_at', '>', $utcNow->toDateTimeString())->exists();
            if ($unfinished) {
                throw new RuntimeException('Valid in-flight runs remain; retry after run expiry.');
            }

            // A verified run need not be the personal best; every verified
            // player/game/version must still have a corresponding period entry.
            $missingBest = DB::table('arcade_runs as r')
                ->where('r.started_at', '>=', $window['starts_at']->toDateTimeString())
                ->where('r.started_at', '<', $window['ends_at']->toDateTimeString())
                ->where('r.status', 'verified')
                ->whereNotExists(function ($query) use ($key): void {
                    $query->selectRaw('1')->from('arcade_leaderboard_entries as e')
                        ->where('e.period_key', $key)
                        ->whereColumn('e.player_id', 'r.player_id')
                        ->whereColumn('e.game_id', 'r.game_id')
                        ->whereColumn('e.rules_version', 'r.rules_version');
                })->exists();
            if ($missingBest) {
                throw new RuntimeException('Verified run has no weekly personal-best entry.');
            }

            $rows = DB::table('arcade_leaderboard_entries as e')
                ->leftJoin('arcade_runs as r', 'r.id', '=', 'e.run_id')
                ->leftJoin('arcade_players as p', 'p.id', '=', 'e.player_id')
                ->where('e.period_key', $key)
                ->get([
                    'e.player_id', 'e.game_id', 'e.rules_version', 'e.score',
                    'e.achieved_at', 'e.run_id', 'r.id as verified_run_id',
                    'r.player_id as run_player_id', 'r.game_id as run_game_id',
                    'r.rules_version as run_rules_version', 'r.score as run_score',
                    'r.started_at as run_started_at', 'r.status as run_status',
                    'r.replay_hash', 'r.completed_at', 'p.id as live_player_id',
                ]);

            $rankings = [];
            $byPlayer = [];
            $versions = [];
            $rankable = new RankedGameCatalog();
            foreach ($rows as $row) {
                if (! $rankable->supportsRanked($row->game_id)
                    || ! $row->live_player_id || ! $row->verified_run_id
                    || $row->run_status !== 'verified' || ! $row->replay_hash
                    || ! $row->completed_at || $row->player_id !== $row->run_player_id
                    || $row->game_id !== $row->run_game_id
                    || $row->rules_version !== $row->run_rules_version
                    || (int) $row->score !== (int) $row->run_score
                    || CarbonImmutable::parse($row->achieved_at, 'UTC')->getTimestamp()
                        !== CarbonImmutable::parse($row->run_started_at, 'UTC')->getTimestamp()) {
                    throw new RuntimeException('Unverified or inconsistent weekly ranking row.');
                }
                $achieved = CarbonImmutable::parse($row->achieved_at, 'UTC');
                if ($achieved->lt($window['starts_at']) || $achieved->gte($window['ends_at'])) {
                    throw new RuntimeException('Weekly ranking has a start time outside its season.');
                }
                $versions[$row->game_id][$row->rules_version] = true;
                $rankings[$row->game_id][] = [
                    'player_id' => $row->player_id,
                    'score' => (int) $row->score,
                    'achieved_at' => $achieved->toIso8601String(),
                    'verified' => true,
                ];
                $byPlayer[$row->game_id][$row->player_id] = $row;
            }
            foreach ($versions as $gameVersions) {
                if (count($gameVersions) !== 1) {
                    throw new RuntimeException('Multiple scoring rules versions in one game/week.');
                }
            }

            $historical = DB::table('arcade_weekly_winners')
                ->where('period_key', '<', $key)->whereNotNull('player_id')
                ->pluck('player_id')->all();
            $winners = $this->selector->select($rankings, $historical);

            $snapshot = [];
            ksort($rankings, SORT_STRING);
            foreach ($rankings as $gameId => $entries) {
                usort($entries, static fn (array $a, array $b): int =>
                    ($b['score'] <=> $a['score'])
                    ?: strcmp($a['achieved_at'], $b['achieved_at'])
                    ?: strcmp($a['player_id'], $b['player_id']));
                foreach ($entries as $index => $entry) {
                    $row = $byPlayer[$gameId][$entry['player_id']];
                    $snapshot[] = [
                        'period_key' => $key, 'game_id' => $gameId,
                        'rules_version' => $row->rules_version, 'player_id' => $row->player_id,
                        'run_id' => $row->run_id, 'score' => (int) $row->score,
                        'achieved_at' => $row->achieved_at, 'technical_rank' => $index + 1,
                        'created_at' => $utcNow->toDateTimeString(),
                    ];
                }
            }
            $awards = [];
            foreach ($winners as $gameId => $gameAwards) {
                foreach ($gameAwards as $winner) {
                    $source = $byPlayer[$gameId][$winner['player_id']];
                    $awards[] = [
                        'period_key' => $key, 'game_id' => $gameId,
                        'rules_version' => $source->rules_version, 'player_id' => $source->player_id,
                        'run_id' => $source->run_id, 'score' => (int) $winner['score'],
                        'achieved_at' => $source->achieved_at,
                        'technical_rank' => $winner['technical_rank'],
                        'prize_rank' => $winner['prize_rank'],
                        'previous_winner' => $winner['previous_winner'],
                        'created_at' => $utcNow->toDateTimeString(),
                    ];
                }
            }
            // Fixed canonical digest of the complete ranked snapshot at sealing.
            $digest = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
            if ($snapshot) DB::table('arcade_weekly_results')->insert($snapshot);
            if ($awards) DB::table('arcade_weekly_winners')->insert($awards);
            DB::table('arcade_weekly_periods')->where('period_key', $key)->update([
                'status' => 'sealed', 'sealed_at' => $utcNow->toDateTimeString(),
                'participants' => count($snapshot), 'winner_count' => count($awards),
                'snapshot_hash' => $digest, 'updated_at' => $utcNow->toDateTimeString(),
            ]);
            DB::table('arcade_weekly_settlement_events')->insert([
                'period_key' => $key, 'event_type' => 'sealed',
                'details' => json_encode([
                    'participants' => count($snapshot), 'winners' => count($awards),
                    'sha256' => $digest, 'algorithm' => 'first-time-priority-v1',
                ], JSON_THROW_ON_ERROR),
                'created_at' => $utcNow->toDateTimeString(),
            ]);

            return ['period_key' => $key, 'status' => 'sealed',
                'participants' => count($snapshot), 'winners' => count($awards)];
        }, 3);
    }

    /** Traverse missed weeks in chronological order for historic-prize fairness. */
    public function sealPending(?CarbonInterface $at = null, int $maxPerRun = 26): array
    {
        $utcNow = $at ? CarbonImmutable::instance($at)->utc() : CarbonImmutable::now('UTC');
        $thisWeek = $this->week($utcNow)['starts_at'];
        $oldestRun = DB::table('arcade_runs')->min('started_at');
        $firstWeek = $oldestRun
            ? $this->week(CarbonImmutable::parse($oldestRun, 'UTC'))['starts_at']
            : $thisWeek->subWeek();
        $results = [];
        // Do not repeatedly count weeks already sealed against the batch cap.
        for ($week = $firstWeek; $week->lt($thisWeek); $week = $week->addWeek()) {
            $window = $this->week($week);
            if (DB::table('arcade_weekly_periods')->where('period_key', $window['period_key'])
                ->where('status', 'sealed')->exists()) {
                continue;
            }
            $results[] = $this->seal($week->setTimezone('Asia/Tehran')->format('Y-m-d'), $utcNow);
            if (count($results) >= $maxPerRun) break;
        }

        return $results;
    }
}
