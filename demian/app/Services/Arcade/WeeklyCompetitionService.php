<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Phase 3 / Step 11 — a single deterministic weekly season contract.
 *
 * All dates are stored in UTC; Saturday 00:00 Asia/Tehran is the only weekly
 * boundary. Public states: scheduled → active → closing → finalized.
 *
 * Existing 'open' / 'sealed' storage is retained for the settlement and coupon
 * ledger. An immutable game/version lock is created on first NEW ranked start.
 *
 * Lock order during run starts: player → period → (new) game rules → run.
 * Completion: player → run → period. Settlement: period. A valid run can
 * finish in the closing period until its expiry and season deadline.
 */
final class WeeklyCompetitionService
{
    private function utc(?CarbonInterface $date = null): CarbonImmutable
    {
        return $date ? CarbonImmutable::instance($date)->utc() : CarbonImmutable::now('UTC');
    }

    public function window(CarbonInterface $when): array
    {
        $start = CarbonImmutable::instance($when)->setTimezone('Asia/Tehran')
            ->startOfWeek(CarbonImmutable::SATURDAY);
        return [
            'period_key' => CompetitionClock::periodKeys($start)[2],
            'starts_at' => $start->utc(),
            'ends_at' => $start->addWeek()->utc(),
        ];
    }

    private function defaultCutoff(): int
    {
        return max(0, min(3600, (int) config('demian-arcade.weekly_start_cutoff_seconds', 30)));
    }

    private function defaultDeadlineSeconds(): int
    {
        return max(60, min(7200, (int) config(
            'demian-arcade.weekly_completion_deadline_seconds', 900)));
    }

    private function deadline(array $window): CarbonImmutable
    {
        return $window['ends_at']->addSeconds($this->defaultDeadlineSeconds());
    }

    private function stage(object $period, CarbonImmutable $now): string
    {
        if ($period->status === 'sealed') return 'finalized';
        if ($now->lt(CarbonImmutable::parse($period->starts_at, 'UTC'))) return 'scheduled';
        if ($now->lt(CarbonImmutable::parse($period->ends_at, 'UTC'))) return 'active';
        return 'closing';
    }

    /**
     * Writes an append-only, deduplicated state record. No synthetic earlier
     * states are manufactured for historical periods created after their end.
     */
    private function observeState(object $period, CarbonImmutable $now): string
    {
        $state = $this->stage($period, $now);
        if ($period->lifecycle_status !== $state) {
            DB::table('arcade_weekly_periods')->where('period_key', $period->period_key)
                ->update(['lifecycle_status' => $state, 'updated_at' => $now->toDateTimeString()]);
        }
        $effective = match ($state) {
            'scheduled' => $now,
            'active' => CarbonImmutable::parse($period->starts_at, 'UTC'),
            'closing' => CarbonImmutable::parse($period->ends_at, 'UTC'),
            'finalized' => CarbonImmutable::parse($period->sealed_at ?? $period->ends_at, 'UTC'),
        };
        DB::table('arcade_weekly_lifecycle_events')->insertOrIgnore([
            'period_key' => $period->period_key, 'state' => $state,
            'effective_at' => $effective->toDateTimeString(),
            'recorded_at' => $now->toDateTimeString(),
        ]);
        return $state;
    }

    /**
     * Safe to call repeatedly and concurrently. This is the only path to
     * creating a period; its stored deadline and cutoff are never recalculated.
     * Caller may already hold a transaction; nested Laravel transactions reuse
     * the same connection and don't release parent row locks early.
     */
    public function ensure(CarbonInterface $when, ?CarbonInterface $observedAt = null): array
    {
        $window = $this->window($when);
        $now = $this->utc($observedAt);
        DB::table('arcade_weekly_periods')->insertOrIgnore([
            'period_key' => $window['period_key'],
            'starts_at' => $window['starts_at']->toDateTimeString(),
            'ends_at' => $window['ends_at']->toDateTimeString(),
            'status' => 'open',
            'lifecycle_status' => 'scheduled',
            'start_cutoff_seconds' => $this->defaultCutoff(),
            'completion_deadline_at' => $this->deadline($window)->toDateTimeString(),
            'created_at' => $now->toDateTimeString(),
            'updated_at' => $now->toDateTimeString(),
        ]);
        $period = DB::table('arcade_weekly_periods')->where('period_key', $window['period_key'])
            ->lockForUpdate()->first();
        if (! $period) throw new \RuntimeException('Unable to prepare weekly competition.');
        // Do not ever overwrite an already sealed historical period.
        $this->observeState($period, $now);
        return $window;
    }

    /** Prepares present and upcoming Saturday seasons, without awards. */
    public function prepare(?CarbonInterface $at = null): array
    {
        $now = $this->utc($at);
        return DB::transaction(function () use ($now): array {
            // Close the previous period when it exists, even if settlement is
            // disabled. Never create a phantom empty historic week.
            $previous = $this->window($now->subWeek());
            if (DB::table('arcade_weekly_periods')
                ->where('period_key', $previous['period_key'])->exists()) {
                $this->ensure($now->subWeek(), $now);
            }
            $this->ensure($now, $now);
            $this->ensure($now->addWeek(), $now);
            return [$this->describe($now), $this->describe($now->addWeek(), $now)];
        }, 3);
    }

    /**
     * Called ONLY after locking a player and finding no idempotent active run.
     * Enforces the season start window and a single frozen version per game.
     * The lock is serialised on the period row even for different players.
     *
     * Returns the stored hard completion deadline for expiry capping.
     */
    public function authorizeNewRun(
        CarbonInterface $start, string $gameId, string $rulesVersion
    ): CarbonImmutable {
        if (strlen($gameId) > 40 || strlen($rulesVersion) > 40
            || $gameId === '' || $rulesVersion === '') {
            throw new InvalidArgumentException('Invalid ranked game or rules version.');
        }
        $now = $this->utc($start);
        $window = $this->ensure($now, $now);
        $period = DB::table('arcade_weekly_periods')
            ->where('period_key', $window['period_key'])->lockForUpdate()->first();
        abort_unless($period && $period->status === 'open'
            && $this->stage($period, $now) === 'active', 409,
            'This weekly competition is not accepting new ranked runs.');
        $closeStartsAt = CarbonImmutable::parse($period->ends_at, 'UTC')
            ->subSeconds((int) $period->start_cutoff_seconds);
        abort_if($now->gte($closeStartsAt), 409,
            'Weekly competition no longer accepts new starts near rollover.');

        $lock = DB::table('arcade_weekly_rule_locks')
            ->where('period_key', $window['period_key'])
            ->where('game_id', $gameId)->first();
        if ($lock) {
            abort_unless($lock->rules_version === $rulesVersion, 409,
                'Scoring rules are frozen for this weekly competition.');
        } else {
            // Historic runs may predate this migration. Never install a new
            // lock that contradicts an earlier issued seed/version.
            $prior = DB::table('arcade_runs')
                ->where('started_at', '>=', $window['starts_at']->toDateTimeString())
                ->where('started_at', '<', $window['ends_at']->toDateTimeString())
                ->where('game_id', $gameId)
                ->distinct()->pluck('rules_version')->all();
            abort_if(count($prior) > 1 || ($prior && $prior[0] !== $rulesVersion),
                409, 'Historic scoring rules cannot change mid-week.');
            DB::table('arcade_weekly_rule_locks')->insert([
                'period_key' => $window['period_key'], 'game_id' => $gameId,
                'rules_version' => $rulesVersion,
                'ranked_enabled' => app(RankedGameCatalog::class)->supportsRanked($gameId),
                'prize_eligible' => app(RankedGameCatalog::class)->supportsPrizes($gameId),
                'locked_at' => $now->toDateTimeString(),
            ]);
        }
        return CarbonImmutable::parse($period->completion_deadline_at, 'UTC');
    }

    /**
     * Called while a verified replay is being persisted, after the caller
     * has locked the player/run. A season may be 'closing' but cannot be
     * finalized, tampered or past its immutable submission deadline.
     */
    public function authorizeCompletion(CarbonInterface $started): void
    {
        $window = $this->ensure($started, $this->utc());
        $row = DB::table('arcade_weekly_periods')
            ->where('period_key', $window['period_key'])->lockForUpdate()->first();
        abort_unless($row && $row->status === 'open'
            && $this->stage($row, $this->utc()) !== 'scheduled', 409,
            'Weekly results are sealed or not yet active.');
        abort_if($this->utc()->gt(CarbonImmutable::parse($row->completion_deadline_at, 'UTC')),
            410, 'Weekly replay submission deadline has elapsed.');
    }

    /** Call inside the settlement transaction after snapshot + winner writes. */
    public function recordFinalized(string $key, CarbonInterface $at): void
    {
        $now = $this->utc($at);
        $period = DB::table('arcade_weekly_periods')->where('period_key', $key)->first();
        if (! $period || $period->status !== 'sealed') {
            throw new \RuntimeException('Only sealed weekly snapshots may be finalized.');
        }
        $this->observeState($period, $now);
    }

    /** Read-only public competition information; no ledger writes on GET. */
    public function describe(CarbonInterface $week, ?CarbonInterface $at = null): array
    {
        $now = $this->utc($at);
        $window = $this->window($week);
        $row = DB::table('arcade_weekly_periods')
            ->where('period_key', $window['period_key'])->first();
        $phase = $row ? $this->stage($row, $now)
            : ($now->lt($window['starts_at']) ? 'scheduled'
                : ($now->lt($window['ends_at']) ? 'active' : 'closing'));
        $deadline = $row && $row->completion_deadline_at
            ? CarbonImmutable::parse($row->completion_deadline_at, 'UTC')
            : $this->deadline($window);
        $cutoff = $row ? (int) $row->start_cutoff_seconds : $this->defaultCutoff();
        $versions = DB::table('arcade_weekly_rule_locks')
            ->where('period_key', $window['period_key'])
            ->orderBy('game_id')->pluck('rules_version', 'game_id')->all();
        return [
            'period_key' => $window['period_key'], 'status' => $phase,
            'timezone' => 'Asia/Tehran',
            'starts_at' => $window['starts_at']->toIso8601String(),
            'ends_at' => $window['ends_at']->toIso8601String(),
            'new_starts_close_at' => $window['ends_at']->subSeconds($cutoff)->toIso8601String(),
            'completion_deadline_at' => $deadline->toIso8601String(),
            'rules_versions' => $versions,
            'server_time' => $now->toIso8601String(),
            'seconds_until_start_cutoff' => $phase !== 'active'
                ? 0 : max(0, (int) ceil($now->diffInSeconds($window['ends_at']->subSeconds($cutoff)))),
        ];
    }

    public function publicSchedule(?CarbonInterface $at = null): array
    {
        $now = $this->utc($at);
        return [
            'current' => $this->describe($now, $now),
            'next' => $this->describe($now->addWeek(), $now),
        ];
    }
}
