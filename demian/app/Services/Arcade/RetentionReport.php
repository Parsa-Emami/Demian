<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Domain\Arcade\CohortRetention;
use Illuminate\Support\Facades\DB;

final class RetentionReport
{
    public function __construct(private readonly \Domain\Shared\Clock $clock) {}

    public function snapshot(int $days = 90): array
    {
        $today = CarbonImmutable::instance($this->clock->now())->setTimezone('Asia/Tehran')->startOfDay();
        $days = max(1, min(90, $days));
        $rows = []; $truncated = false;
        $players = DB::table('arcade_players')->select(['id', 'created_at'])
            ->where('created_at', '>=', $today->subDays($days)->utc())
            ->where('created_at', '<', $today->utc())->orderBy('id')->limit(10001)->get();
        if ($players->count() > 10000) $truncated = true;
        foreach ($players->take(10000)->chunk(100) as $batch) {
            $runs = DB::table('arcade_runs')->select(['player_id', 'started_at'])->where('status', 'verified')
                ->whereIn('player_id', $batch->pluck('id'))->where('started_at', '>=', $today->subDays($days)->utc())
                ->where('started_at', '<', $today->utc())->orderBy('id')->limit(20001)->get();
            if ($runs->count() > 20000) { $truncated = true; break; }
            $active = [];
            foreach ($runs as $run) $active[$run->player_id][CarbonImmutable::parse($run->started_at, 'UTC')->setTimezone('Asia/Tehran')->toDateString()] = true;
            foreach ($batch as $player) $rows[] = [
                'joined' => CarbonImmutable::parse($player->created_at, 'UTC')->setTimezone('Asia/Tehran')->toDateString(),
                'active_days' => array_keys($active[$player->id] ?? []),
            ];
        }
        return ['status' => $truncated ? 'incomplete' : ($rows ? 'ok' : 'no_data'),
            'timezone' => 'Asia/Tehran', 'as_of' => $today->toDateString(), 'days' => $days,
            'definition' => 'Exact-day verified-play retention of surviving registered accounts; mature days only.',
            'limitations' => ['Practice and unregistered play excluded', 'Deleted accounts excluded', 'Not a causal measure of game quality'],
            'players' => count($rows), 'truncated' => $truncated,
            'cohorts' => CohortRetention::summarize($rows, $today->toDateString())];
    }
}
