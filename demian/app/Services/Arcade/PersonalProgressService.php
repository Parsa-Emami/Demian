<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class PersonalProgressService
{
    public const GAMES = ['dino-run', 'cafe-critters', 'coffee-crash', 'cafe-drift', 'after-hours', 'cafe-rush', 'open-world'];

    public function seal(string $key, array $snapshot, string $digest, CarbonInterface $at): void
    {
        if (DB::transactionLevel() < 1 || ! hash_equals($digest, hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR)))) {
            throw new RuntimeException('Progress requires the trusted settlement transaction.');
        }
        $period = DB::table('arcade_weekly_periods')->where('period_key', $key)->lockForUpdate()->first();
        if (! $period || $period->status !== 'open') {
            throw new RuntimeException('Progress source is not an open settlement.');
        }
        $players = array_values(array_unique(array_column($snapshot, 'player_id')));
        sort($players, SORT_STRING);
        $verified = app(ArcadePrizeIdentity::class)->verifiedPhoneDates($players);
        $history = [];
        foreach (array_chunk($players, 400) as $ids) {
            $prior = DB::table('arcade_personal_progress as p')
                ->join('arcade_weekly_periods as w', 'w.period_key', '=', 'p.period_key')
                ->where('w.status', 'sealed')->whereIn('p.player_id', $ids)
                ->select('p.player_id', 'p.game_id', 'p.rules_version')
                ->selectRaw('MAX(p.score) AS best, COUNT(*) AS weeks, MAX(p.period_key) AS last_period')
                ->groupBy('p.player_id', 'p.game_id', 'p.rules_version')->get();
            foreach ($prior as $r) {
                $history[$r->player_id][$r->game_id][$r->rules_version] = $r;
            }
        }
        $rows = [];
        foreach ($snapshot as $r) {
            if ($r['period_key'] !== $key || ! in_array($r['game_id'], self::GAMES, true)) {
                throw new RuntimeException('Invalid progress source.');
            }
            $player = $r['player_id'];
            if (! isset($verified[$player]) || CarbonImmutable::parse($verified[$player], 'UTC')->gt(CarbonImmutable::parse($r['achieved_at'], 'UTC'))) {
                continue;
            }
            $old = $history[$player][$r['game_id']][$r['rules_version']] ?? null;
            $result = PersonalProgressPolicy::evaluate((int) $r['score'], $old ? (int) $old->best : null, $old ? (int) $old->weeks : 0,
                $old !== null && strcmp($old->last_period, $key) > 0);
            $rows[] = ['period_key' => $key, 'player_id' => $player, 'run_id' => $r['run_id'], 'game_id' => $r['game_id'],
                'rules_version' => $r['rules_version'], 'policy_version' => PersonalProgressPolicy::VERSION,
                'score' => (int) $r['score'], ...$result, 'source_sha256' => $digest, 'achieved_at' => $r['achieved_at'],
                'created_at' => CarbonImmutable::instance($at)->utc()->toDateTimeString()];
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('arcade_personal_progress')->insert($chunk);
        }
    }

    public function profile(string $player, string $game): array
    {
        $verified = app(ArcadePrizeIdentity::class)->verifiedRecipientIds([$player]) !== [];
        $response = ['verified' => $verified, 'game_id' => $game, 'status' => 'unverified', 'rules' => PersonalProgressPolicy::rules(),
            'rules_version' => null, 'personal_best' => null, 'weeks' => 0, 'next_goal' => null, 'badges' => 0, 'history' => []];
        if (! $verified) {
            return $response;
        }
        $query = DB::table('arcade_personal_progress as p')->join('arcade_weekly_periods as w', 'w.period_key', '=', 'p.period_key')
            ->where('w.status', 'sealed')->where('p.player_id', $player)->where('p.game_id', $game);
        $last = (clone $query)->orderByDesc('p.period_key')->first(['p.rules_version']);
        if (! $last) {
            return [...$response, 'status' => 'awaiting_first_week'];
        }
        $query->where('p.rules_version', $last->rules_version);
        $summary = (clone $query)->selectRaw('MAX(p.score) AS best, COUNT(*) AS weeks, COUNT(p.badge) AS badges')->first();
        $history = (clone $query)->orderByDesc('p.period_key')->limit(12)->get([
            'p.period_key', 'p.score', 'p.previous_best', 'p.target_score', 'p.personal_record', 'p.badge', 'p.status',
        ])->reverse()->values()->map(static fn ($r) => [
            'period_key' => $r->period_key, 'score' => (int) $r->score,
            'previous_best' => $r->previous_best === null ? null : (int) $r->previous_best,
            'target_score' => $r->target_score === null ? null : (int) $r->target_score,
            'personal_record' => (bool) $r->personal_record, 'badge' => $r->badge, 'status' => $r->status,
        ])->all();
        $best = (int) $summary->best;
        $weeks = (int) $summary->weeks;

        return [...$response, 'status' => $weeks < PersonalProgressPolicy::PLACEMENT_WEEKS ? 'calibrating' : 'active',
            'rules_version' => $last->rules_version, 'personal_best' => $best, 'weeks' => $weeks,
            'next_goal' => PersonalProgressPolicy::goal($best,$weeks), 'badges' => (int) $summary->badges, 'history' => $history];
    }
}
