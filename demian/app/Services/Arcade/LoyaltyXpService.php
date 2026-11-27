<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class LoyaltyXpService
{
    public function seal(string $key, string $digest, CarbonInterface $at): void
    {
        if (DB::transactionLevel() < 1 || ! preg_match('/^[a-f0-9]{64}$/D', $digest)) {
            throw new RuntimeException('XP requires a trusted settlement transaction.');
        }
        $period = DB::table('arcade_weekly_periods')->where('period_key', $key)->lockForUpdate()->first();
        if (! $period || $period->status !== 'open') {
            throw new RuntimeException('XP settlement period is not open.');
        }
        $priorKey = app(WeeklyCompetitionService::class)->window(CarbonImmutable::parse($period->starts_at, 'UTC')->subWeek())['period_key'];
        $participants = DB::table('arcade_personal_progress')->where('period_key', $key)
            ->select('player_id')->selectRaw('COUNT(DISTINCT game_id) AS games')
            ->selectRaw('MAX(CASE WHEN badge = ? THEN 1 ELSE 0 END) AS breakthrough', ['personal-breakthrough'])
            ->groupBy('player_id')->orderBy('player_id')->get();
        if (DB::table('arcade_personal_progress')->where('period_key', $key)->where('source_sha256', '!=', $digest)->exists()) {
            throw new RuntimeException('XP source checksum mismatch.');
        }
        foreach ($participants->chunk(400) as $chunk) {
            $ids = $chunk->pluck('player_id')->all();
            $previous = DB::table('arcade_loyalty_xp as x')->join('arcade_weekly_periods as w', 'w.period_key', '=', 'x.period_key')
                ->where('w.status', 'sealed')->whereIn('x.player_id', $ids)
                ->select('x.player_id')->selectRaw('MAX(x.period_key) AS latest_period')
                ->selectRaw('MAX(CASE WHEN x.period_key = ? THEN 1 ELSE 0 END) AS previous_week', [$priorKey])
                ->groupBy('x.player_id')->get()->keyBy('player_id');
            $rows = [];
            foreach ($chunk as $row) {
                $history = $previous->get($row->player_id);
                $late = $history !== null && strcmp($history->latest_period, $key) > 0;
                $parts = LoyaltyXpPolicy::calculate((int) $row->games, ! $late && (bool) $row->breakthrough,
                    ! $late && $history !== null && (bool) $history->previous_week);
                if ($parts['total_xp'] > LoyaltyXpPolicy::WEEKLY_CAP) {
                    throw new RuntimeException('XP cap exceeded.');
                }
                $rows[] = ['period_key' => $key, 'player_id' => $row->player_id, 'policy_version' => LoyaltyXpPolicy::VERSION,
                    'distinct_games' => (int) $row->games, ...$parts, 'late_seal' => $late,
                    'source_sha256' => $digest, 'created_at' => CarbonImmutable::instance($at)->utc()->toDateTimeString()];
            }
            foreach (array_chunk($rows, 200) as $batch) {
                DB::table('arcade_loyalty_xp')->insert($batch);
            }
        }
    }

    public function profile(string $player): array
    {
        $verified = app(ArcadePrizeIdentity::class)->verifiedRecipientIds([$player]) !== [];
        $base = ['verified' => $verified, 'status' => $verified ? 'awaiting_first_week' : 'unverified',
            'total_xp' => 0, 'mission_xp' => 0, 'active_weeks' => 0, ...LoyaltyXpPolicy::level(0), 'history' => [], 'rules' => LoyaltyXpPolicy::rules()];
        if (! $verified) {
            return $base;
        }
        $query = DB::table('arcade_loyalty_xp as x')->join('arcade_weekly_periods as w', 'w.period_key', '=', 'x.period_key')
            ->where('w.status', 'sealed')->where('x.player_id', $player);
        $summary = (clone $query)->selectRaw('COALESCE(SUM(x.total_xp),0) AS xp, COUNT(*) AS weeks')->first();
        $missions = DB::table('arcade_mission_weeks as m')->join('arcade_weekly_periods as w', 'w.period_key', '=', 'm.period_key')
            ->where('w.status', 'sealed')->where('m.player_id', $player);
        $missionTotal = (int) (clone $missions)->sum('m.total_xp');
        $recentMissions = (clone $missions)->orderByDesc('m.period_key')->limit(12)->pluck('m.total_xp', 'm.period_key');
        $xp = (int) $summary->xp + $missionTotal;
        $history = (clone $query)->orderByDesc('x.period_key')->limit(12)->get([
            'x.period_key', 'x.distinct_games', 'x.participation_xp', 'x.variety_xp', 'x.progress_xp', 'x.continuity_xp', 'x.total_xp', 'x.late_seal',
        ])->map(static fn ($r) => ['period_key' => $r->period_key, 'distinct_games' => (int) $r->distinct_games,
            'participation_xp' => (int) $r->participation_xp, 'variety_xp' => (int) $r->variety_xp,
            'progress_xp' => (int) $r->progress_xp, 'continuity_xp' => (int) $r->continuity_xp,
            'base_xp' => (int) $r->total_xp, 'mission_xp' => (int) ($recentMissions[$r->period_key] ?? 0),
            'total_xp' => (int) $r->total_xp + (int) ($recentMissions[$r->period_key] ?? 0), 'late_seal' => (bool) $r->late_seal])->all();

        return [...$base, 'status' => $xp > 0 ? 'active' : $base['status'], 'total_xp' => $xp, 'mission_xp' => $missionTotal, 'active_weeks' => (int) $summary->weeks,
            ...LoyaltyXpPolicy::level($xp), 'history' => $history];
    }
}
