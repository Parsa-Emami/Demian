<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Phase 3 Step 12: deterministic, explicitly non-financial, cross-game
 * comparative standings from the already verified/sealed personal bests.
 *
 * Formula v1 (integers, no floats, no raw score comparisons across games):
 * points = floor(1000 * (n - 1 - count(scores strictly greater))
 *                / max(n - 1, 19)).
 * Only cohorts of >=20 independent players qualify; smaller cohorts are
 * PROVISIONAL and always rank after qualified participants.
 *
 * A player contributes at most ONE best per game and ONE best among games.
 * Equal raw scores receive equal game points and ranks. Equal global points
 * share a competition rank; earlier verified start and stable IDs only order
 * the display, never change points. No prize ledger is touched.
 *
 * This is a transparent candidate model, NOT proof of equal difficulty,
 * independence of accounts, player humanity, or approved voucher allocation.
 */
final class WeeklyFairScoringService
{
    public const VERSION = 'relative-cohort-v1';
    public const MAX_POINTS = 1000;
    public const MIN_COHORT = 20;

    public function rules(): array
    {
        return [
            'algorithm_version' => self::VERSION,
            'maximum_points' => self::MAX_POINTS,
            'minimum_cohort' => self::MIN_COHORT,
            'formula' => 'floor(1000 * (cohort_size - 1 - higher_raw_scores) / max(cohort_size - 1, 19))',
            'tie_break' => 'equal_points_share_rank; earlier_server_run_start_then_stable_id_orders_display',
            'weekly_contribution' => 'best_verified_run_per_game; best_qualified_game_per_player; no_score_summing',
            'minimum_cohort_policy' => 'smaller cohorts are provisional and ordered after qualified results',
            'financial_awards_enabled' => false,
            'calibration_status' => 'requires_independent_playtests_and_character_difficulty_review',
        ];
    }

    /**
     * Called in a serialized competition-period transaction on prepare/start,
     * so deployment config changes cannot rewrite a live season's formula.
     */
    public function freezePolicy(string $periodKey): object
    {
        DB::table('arcade_weekly_fair_policies')->insertOrIgnore([
            'period_key' => $periodKey,
            'algorithm_version' => self::VERSION,
            'maximum_points' => self::MAX_POINTS,
            'minimum_cohort' => self::MIN_COHORT,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $policy = DB::table('arcade_weekly_fair_policies')
            ->where('period_key', $periodKey)->first();
        if (! $policy || $policy->algorithm_version !== self::VERSION
            || (int) $policy->maximum_points !== self::MAX_POINTS
            || (int) $policy->minimum_cohort !== self::MIN_COHORT) {
            throw new RuntimeException('Unsupported frozen weekly scoring policy. Preserve the original version.');
        }
        return $policy;
    }

    /**
     * Pure deterministic transform; input ONLY from the existing server-verified
     * technical snapshot. Never accept this input from an HTTP request.
     *
     * @return array{games: array<int, array>, standings: array<int, array>, sha256: string}
     */
    public function calculate(string $periodKey, array $snapshot, object $policy): array
    {
        if ($policy->algorithm_version !== self::VERSION
            || (int) $policy->minimum_cohort !== self::MIN_COHORT
            || (int) $policy->maximum_points !== self::MAX_POINTS) {
            throw new RuntimeException('Unknown normalized scoring policy version.');
        }
        $byGame = [];
        $seen = [];
        $gameVersions = [];
        foreach ($snapshot as $entry) {
            if (! is_array($entry)
                || ($entry['period_key'] ?? null) !== $periodKey
                || ! is_string($entry['player_id'] ?? null)
                || $entry['player_id'] === ''
                || ! is_string($entry['game_id'] ?? null)
                || $entry['game_id'] === ''
                || ! is_string($entry['run_id'] ?? null)
                || $entry['run_id'] === ''
                || ! is_string($entry['rules_version'] ?? null)
                || $entry['rules_version'] === ''
                || ! is_numeric($entry['score'] ?? null)
                || (int) $entry['score'] < 0
                || (string) (int) $entry['score'] !== (string) $entry['score']) {
                throw new RuntimeException('Invalid verified source for weekly normalization.');
            }
            $game = $entry['game_id'];
            $id = $entry['player_id'];
            $key = $game."\0".$id;
            if (isset($seen[$key])) {
                throw new RuntimeException('Multiple weekly bests for the same player and game.');
            }
            $seen[$key] = true;
            $version = $entry['rules_version'];
            if (isset($gameVersions[$game]) && $gameVersions[$game] !== $version) {
                throw new RuntimeException('Cannot normalize mixed scoring rule versions.');
            }
            $gameVersions[$game] = $version;
            try {
                $achieved = CarbonImmutable::parse($entry['achieved_at'], 'UTC')
                    ->utc()->format('Y-m-d H:i:s');
            } catch (\Throwable $error) {
                throw new RuntimeException('Invalid verified achievement timestamp.', 0, $error);
            }
            $byGame[$game][] = [
                'period_key' => $periodKey,
                'game_id' => $game,
                'rules_version' => $version,
                'player_id' => $id,
                'run_id' => $entry['run_id'],
                'raw_score' => (int) $entry['score'],
                'achieved_at' => $achieved,
            ];
        }
        ksort($byGame, SORT_STRING);
        $games = [];
        $bestByPlayer = [];
        foreach ($byGame as $game => $entries) {
            // Independent players, not repeat runs, define the cohort.
            usort($entries, static fn (array $a, array $b): int =>
                ($b['raw_score'] <=> $a['raw_score'])
                ?: strcmp($a['achieved_at'], $b['achieved_at'])
                ?: strcmp($a['player_id'], $b['player_id']));
            $n = count($entries);
            $denominator = max($n - 1, (int) $policy->minimum_cohort - 1);
            $higher = 0;
            $previous = null;
            foreach ($entries as $index => $entry) {
                if ($previous !== $entry['raw_score']) {
                    $higher = $index;
                    $previous = $entry['raw_score'];
                }
                $row = [
                    ...$entry,
                    'competition_points' => intdiv(
                        (int) $policy->maximum_points * ($n - 1 - $higher),
                        $denominator),
                    'cohort_size' => $n,
                    'game_rank' => $higher + 1,
                    'position' => $index + 1,
                    'qualified' => $n >= (int) $policy->minimum_cohort,
                ];
                $games[] = $row;
                $playerId = $entry['player_id'];
                if (! isset($bestByPlayer[$playerId])
                    || $this->betterPersonalContribution($row, $bestByPlayer[$playerId])) {
                    $bestByPlayer[$playerId] = $row;
                }
            }
        }

        $global = array_values($bestByPlayer);
        usort($global, static fn (array $a, array $b): int =>
            ((int) $b['qualified'] <=> (int) $a['qualified'])
            ?: ($b['competition_points'] <=> $a['competition_points'])
            ?: strcmp($a['achieved_at'], $b['achieved_at'])
            ?: strcmp($a['player_id'], $b['player_id']));
        $standings = [];
        $previousGroup = null;
        $rank = 0;
        foreach ($global as $index => $entry) {
            $group = ((int) $entry['qualified']).':'.$entry['competition_points'];
            if ($group !== $previousGroup) {
                $rank = $index + 1;
                $previousGroup = $group;
            }
            $standings[] = [
                'period_key' => $periodKey,
                'player_id' => $entry['player_id'],
                'run_id' => $entry['run_id'],
                'source_game_id' => $entry['game_id'],
                'rules_version' => $entry['rules_version'],
                'raw_score' => $entry['raw_score'],
                'competition_points' => $entry['competition_points'],
                'cohort_size' => $entry['cohort_size'],
                'qualified' => $entry['qualified'],
                'competition_rank' => $rank,
                'position' => $index + 1,
                'achieved_at' => $entry['achieved_at'],
            ];
        }

        $digest = hash('sha256', json_encode([
            'algorithm_version' => self::VERSION,
            'maximum_points' => (int) $policy->maximum_points,
            'minimum_cohort' => (int) $policy->minimum_cohort,
            'per_game' => $games,
            'global' => $standings,
        ], JSON_THROW_ON_ERROR));

        return ['games' => $games, 'standings' => $standings, 'sha256' => $digest];
    }

    private function betterPersonalContribution(array $candidate, array $current): bool
    {
        return ((int) $candidate['qualified'] <=> (int) $current['qualified']) > 0
            || ($candidate['qualified'] === $current['qualified']
                && (($candidate['competition_points'] <=> $current['competition_points']) > 0
                    || ($candidate['competition_points'] === $current['competition_points']
                        && (strcmp($candidate['achieved_at'], $current['achieved_at']) < 0
                            || ($candidate['achieved_at'] === $current['achieved_at']
                                && strcmp($candidate['game_id'], $current['game_id']) < 0)))));
    }

    /**
     * Called in the SAME transaction as the original weekly snapshot and
     * coupon candidate writes. A failure rolls everything back.
     */
    public function sealFromTrustedSnapshot(
        string $periodKey, array $snapshot, string $sourceHash,
        CarbonInterface $sealedAt
    ): array {
        $period = DB::table('arcade_weekly_periods')->where('period_key', $periodKey)
            ->lockForUpdate()->first();
        if (! $period || ! in_array($period->status, ['open', 'sealed'], true)) {
            throw new RuntimeException('Unknown source weekly competition.');
        }
        $expected = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
        if (! hash_equals($expected, $sourceHash)) {
            throw new RuntimeException('Source technical ranking checksum mismatch.');
        }
        $policy = $this->freezePolicy($periodKey);
        if ($policy->finalized_at !== null) {
            if (! $policy->source_snapshot_hash
                || ! hash_equals($policy->source_snapshot_hash, $sourceHash)) {
                throw new RuntimeException('Finalized comparative standings cannot be replaced.');
            }
            return ['status' => 'already_scored', 'sha256' => $policy->fair_snapshot_hash];
        }
        $calculated = $this->calculate($periodKey, $snapshot, $policy);
        $now = CarbonImmutable::instance($sealedAt)->utc()->toDateTimeString();
        foreach (array_chunk($calculated['games'], 250) as $chunk) {
            DB::table('arcade_weekly_fair_game_scores')->insert(
                array_map(static fn (array $row): array =>
                    [...$row, 'created_at' => $now], $chunk));
        }
        foreach (array_chunk($calculated['standings'], 250) as $chunk) {
            DB::table('arcade_weekly_fair_standings')->insert(
                array_map(static fn (array $row): array =>
                    [...$row, 'created_at' => $now], $chunk));
        }
        $qualified = count(array_filter($calculated['standings'],
            static fn (array $row): bool => $row['qualified']));
        DB::table('arcade_weekly_fair_policies')
            ->where('period_key', $periodKey)->whereNull('finalized_at')
            ->update([
                'source_snapshot_hash' => $sourceHash,
                'fair_snapshot_hash' => $calculated['sha256'],
                'result_count' => count($calculated['standings']),
                'qualified_count' => $qualified,
                'finalized_at' => $now,
                'updated_at' => $now,
            ]);
        return [
            'status' => 'scored',
            'sha256' => $calculated['sha256'],
            'participants' => count($calculated['standings']),
            'qualified' => $qualified,
        ];
    }

    /**
     * Explicit backfill of a PREEXISTING sealed week. Verify the original
     * immutable technical snapshot hash before generating parallel points.
     * Do not silently modify earlier winner or coupon snapshots.
     */
    public function backfillSealed(string $periodKey): array
    {
        $this->validatePeriodKey($periodKey);
        return DB::transaction(function () use ($periodKey): array {
            $period = DB::table('arcade_weekly_periods')
                ->where('period_key', $periodKey)->lockForUpdate()->first();
            if (! $period || $period->status !== 'sealed'
                || ! preg_match('/^[a-f0-9]{64}$/D', $period->snapshot_hash ?? '')) {
                throw new RuntimeException('Only verified sealed weeks support fair-score backfill.');
            }
            $snapshot = DB::table('arcade_weekly_results')
                ->where('period_key', $periodKey)
                ->orderBy('game_id')->orderBy('technical_rank')->get()
                ->map(static fn (object $row): array => [
                    'period_key' => $row->period_key,
                    'game_id' => $row->game_id,
                    'rules_version' => $row->rules_version,
                    'player_id' => $row->player_id,
                    'run_id' => $row->run_id,
                    'score' => (int) $row->score,
                    'achieved_at' => $row->achieved_at,
                    'technical_rank' => (int) $row->technical_rank,
                    'created_at' => $row->created_at,
                ])->all();
            if (count($snapshot) !== (int) $period->participants) {
                throw new RuntimeException('Historical technical snapshot count mismatch.');
            }
            $digest = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
            if (! hash_equals($period->snapshot_hash, $digest)) {
                throw new RuntimeException('Historical technical snapshot hash mismatch.');
            }
            return $this->sealFromTrustedSnapshot(
                $periodKey, $snapshot, $digest,
                CarbonImmutable::parse($period->sealed_at, 'UTC'));
        }, 3);
    }

    public function validatePeriodKey(string $key): CarbonImmutable
    {
        if (! preg_match('/^weekly:tehran:(\d{4}-\d{2}-\d{2})$/D', $key, $parts)) {
            throw new InvalidArgumentException('Invalid Tehran weekly period key.');
        }
        try {
            $start = CarbonImmutable::createFromFormat('!Y-m-d', $parts[1], 'Asia/Tehran');
        } catch (\Throwable $e) {
            throw new InvalidArgumentException('Invalid Tehran Saturday.', 0, $e);
        }
        if (! $start || $start->format('Y-m-d') !== $parts[1]
            || $start->dayOfWeek !== CarbonImmutable::SATURDAY) {
            throw new InvalidArgumentException('Week must start on a Tehran Saturday.');
        }
        return $start;
    }

    /**
     * Read-only, scoped to a fully finalized week; no client-submitted score
     * or "run complete" data reaches this query. Erased accounts stay hidden.
     */
    public function publicRead(string $periodKey, int $limit = 20): array
    {
        $this->validatePeriodKey($periodKey);
        if ($limit < 1 || $limit > 50) {
            throw new InvalidArgumentException('Invalid fair leaderboard size.');
        }
        $policy = DB::table('arcade_weekly_fair_policies')
            ->where('period_key', $periodKey)->first();
        $period = DB::table('arcade_weekly_periods')
            ->where('period_key', $periodKey)->first();
        $ready = $period && $period->status === 'sealed'
            && $policy && $policy->finalized_at !== null;
        if (! $ready) {
            return [
                'period_key' => $periodKey,
                'status' => 'not_finalized',
                'rules' => $this->rules(),
                'data' => [],
            ];
        }
        $rows = DB::table('arcade_weekly_fair_standings as s')
            ->join('arcade_players as p', 'p.id', '=', 's.player_id')
            ->where('s.period_key', $periodKey)
            ->orderBy('s.position')->limit($limit)->get([
                's.player_id', 'p.display_name', 's.source_game_id',
                's.competition_points', 's.cohort_size', 's.qualified',
                's.competition_rank', 's.position', 's.achieved_at',
            ]);
        $games = DB::table('arcade_weekly_fair_game_scores')
            ->where('period_key', $periodKey)
            ->select('game_id')->selectRaw('MAX(cohort_size) as participants')
            ->groupBy('game_id')->orderBy('game_id')->get()
            ->map(static fn (object $row): array => [
                'game_id' => $row->game_id,
                'participants' => (int) $row->participants,
                'qualified' => (int) $row->participants >= self::MIN_COHORT,
            ])->all();
        return [
            'period_key' => $periodKey,
            'status' => 'finalized',
            'algorithm_version' => $policy->algorithm_version,
            'snapshot_hash' => $policy->fair_snapshot_hash,
            'participants' => (int) $policy->result_count,
            'qualified_participants' => (int) $policy->qualified_count,
            'rules' => $this->rules(),
            'games' => $games,
            'data' => $rows->map(static fn (object $row): array => [
                'rank' => (int) $row->competition_rank,
                'position' => (int) $row->position,
                'player_id' => $row->player_id,
                'display_name' => $row->display_name,
                'source_game_id' => $row->source_game_id,
                'competition_points' => (int) $row->competition_points,
                'cohort_size' => (int) $row->cohort_size,
                'qualified' => (bool) $row->qualified,
                'achieved_at' => $row->achieved_at,
            ])->all(),
        ];
    }
}
