<?php

namespace App\Services\Arcade;

use App\Models\ArcadePlayer;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class SkillLeagueService
{
    public function __construct(private readonly ArcadePrizeIdentity $identity) {}

    private function history(array $players, string $key, string $cutoff): array
    {
        $history = [];
        foreach (array_chunk($players, 400) as $ids) {
            $rows = DB::table('arcade_skill_standings as s')
                ->join('arcade_skill_seasons as w', 'w.period_key', '=', 's.period_key')
                ->whereIn('s.player_id', $ids)->where('s.period_key', '<', $key)
                ->where('w.finalized_at', '<=', $cutoff)->where('s.qualified', true)
                ->orderBy('s.period_key')->get(['s.player_id', 's.points']);
            foreach ($rows as $row) {
                $history[$row->player_id][] = (int) $row->points;
            }
        }

        return $history;
    }

    public function seal(string $key, array $snapshot, string $sourceHash, CarbonInterface $at): void
    {
        $start = app(WeeklyFairScoringService::class)->validatePeriodKey($key)->utc()->toDateTimeString();
        if (! hash_equals($sourceHash, hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR)))) {
            throw new RuntimeException('League source checksum mismatch.');
        }
        $existing = DB::table('arcade_skill_seasons')->where('period_key', $key)->first();
        if ($existing) {
            if (! hash_equals($existing->source_sha256, $sourceHash)) {
                throw new RuntimeException('Immutable league source differs.');
            }

            return;
        }

        $verified = $this->identity->verifiedPhoneDates(array_values(array_unique(array_column($snapshot, 'player_id'))));
        $eligible = array_filter($snapshot, static fn (array $row): bool => isset($verified[$row['player_id']])
            && CarbonImmutable::parse($verified[$row['player_id']], 'UTC')
                ->lte(CarbonImmutable::parse($row['achieved_at'], 'UTC')));
        $entries = SkillLeaguePolicy::normalize($eligible);
        $history = $this->history(array_column($entries, 'player_id'), $key, $start);
        $groups = [];
        foreach ($entries as $row) {
            $classification = SkillLeaguePolicy::classify($history[$row['player_id']] ?? [],
                $row['qualified'] ? $row['points'] : null);
            if (! $row['qualified']) {
                $classification['league'] = 'placement';
            }
            $groups[$classification['league']][] = ['period_key' => $key, ...$row, ...$classification];
        }
        ksort($groups, SORT_STRING);
        $rows = [];
        foreach ($groups as $group) {
            usort($group, static fn (array $a, array $b): int => ($b['points'] <=> $a['points'])
                ?: strcmp($a['achieved_at'], $b['achieved_at']) ?: strcmp($a['player_id'], $b['player_id']));
            $previous = null;
            $rank = 0;
            foreach ($group as $index => $row) {
                if ($previous !== $row['points']) {
                    $rank = $index + 1;
                    $previous = $row['points'];
                }
                $rows[] = [...$row, 'rank' => $rank, 'position' => $index + 1];
            }
        }
        DB::table('arcade_skill_seasons')->insert([
            'period_key' => $key,
            'policy_version' => SkillLeaguePolicy::VERSION,
            'source_sha256' => $sourceHash,
            'snapshot_sha256' => hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR)),
            'participants' => count($rows),
            'qualified' => count(array_filter($rows, static fn (array $row): bool => $row['qualified'])),
            'finalized_at' => CarbonImmutable::instance($at)->utc()->toDateTimeString(),
        ]);
        foreach (array_chunk($rows, 250) as $chunk) {
            DB::table('arcade_skill_standings')->insert($chunk);
        }
    }

    public function board(?string $key, string $league, int $limit): array
    {
        if ($key !== null) {
            app(WeeklyFairScoringService::class)->validatePeriodKey($key);
        }
        $season = DB::table('arcade_skill_seasons as s')->join('arcade_weekly_periods as w', 'w.period_key', '=', 's.period_key')
            ->where('w.status', 'sealed')->when($key !== null, fn ($query) => $query->where('s.period_key', $key))
            ->orderByDesc('s.period_key')->first(['s.period_key', 's.snapshot_sha256']);
        $base = ['period_key' => $season?->period_key ?? $key, 'league' => $league, 'rules' => SkillLeaguePolicy::rules()];
        if (! $season) {
            return [...$base, 'data' => [], 'participants' => 0, 'status' => 'not_finalized'];
        }
        $query = DB::table('arcade_skill_standings as s')->join('arcade_players as p', 'p.id', '=', 's.player_id')
            ->where('s.period_key', $season->period_key)->where('s.league', $league);
        $count = (clone $query)->count();
        $rows = $query->orderBy('s.position')->limit($limit)
            ->get(['p.display_name', 's.points', 's.rank', 's.position', 's.qualified', 's.movement', 's.cohort_size', 's.source_game_id']);

        return [...$base, 'status' => 'finalized', 'participants' => $count, 'snapshot_sha256' => $season->snapshot_sha256,
            'data' => $rows->map(static fn (object $row): array => [
                'display_name' => $row->display_name,
                'points' => (int) $row->points,
                'rank' => (int) $row->rank,
                'position' => (int) $row->position,
                'qualified' => (bool) $row->qualified,
                'movement' => $row->movement,
                'cohort_size' => (int) $row->cohort_size,
                'source_game_id' => $row->source_game_id,
                'recognition' => (bool) $row->qualified && (int) $row->rank <= 3,
            ])->all()];
    }

    public function profile(ArcadePlayer $player): array
    {
        $window = app(WeeklyCompetitionService::class)->window(CarbonImmutable::now('UTC'));
        $history = $this->history([$player->id], $window['period_key'], $window['starts_at']->toDateTimeString());
        $scores = $history[$player->id] ?? [];
        $state = SkillLeaguePolicy::classify($scores, null);
        $last = DB::table('arcade_skill_standings as s')->join('arcade_weekly_periods as w', 'w.period_key', '=', 's.period_key')
            ->where('w.status', 'sealed')->where('s.player_id', $player->id)->orderByDesc('s.period_key')
            ->first(['s.period_key', 's.league', 's.points', 's.qualified', 's.rank', 's.movement']);
        if ($last) {
            $last->qualified = (bool) $last->qualified;
            $last->points = (int) $last->points;
            $last->rank = (int) $last->rank;
        }

        return ['current_period' => $window['period_key'], 'current_league' => $state['league'],
            'peak_tier' => $state['peak_tier'], 'low_weeks' => $state['low_weeks'], 'qualified_weeks' => count($scores),
            'verified' => $this->identity->status($player)['phone_verified'], 'last_result' => $last,
            'rules' => SkillLeaguePolicy::rules()];
    }
}
