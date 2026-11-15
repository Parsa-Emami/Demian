<?php

namespace App\Console\Commands;

use App\Services\Arcade\WeeklyAwardFinalizationService;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeFinalizeWeeklyAwardsCommand extends Command
{
    protected $signature = 'arcade:finalize-weekly-awards
        {--week= : Optional Tehran Saturday YYYY-MM-DD}
        {--limit=10 : Maximum prepared periods, 1–26}
        {--apply : Explicitly authorize immutable winner settlement and coupon issuance}
        {--json : Print non-secret machine-readable summary}';

    protected $description = 'Safely coordinate weekly snapshot settlement and code allocation, exact-once.';

    public function handle(WeeklyAwardFinalizationService $service): int
    {
        try {
            $limit = (string) $this->option('limit');
            if (! preg_match('/^[1-9][0-9]?$/D', $limit)
                || (int) $limit > 26) {
                throw new \InvalidArgumentException('Batch limit must be 1–26.');
            }
            $week = $this->option('week');
            $week = $week === null ? null : (string) $week;
            $result = $this->option('apply')
                ? $service->finalize(null, $week, (int) $limit)
                : $service->preview(null, $week, (int) $limit);
            if ($this->option('json')) {
                $this->line(json_encode($result, JSON_THROW_ON_ERROR));
            } else {
                $this->info('Status: '.($result['status'] ?? $result['mode']));
                foreach ($result['completed'] ?? $result['eligible_periods'] ?? [] as $entry) {
                    $this->line(is_array($entry) ? $entry['period_key'] : $entry);
                }
                if (($result['blocked'] ?? null) !== null) {
                    $this->error($result['blocked']['period_key'].': '.$result['blocked']['error']);
                }
            }

            return ($result['status'] ?? 'ok') === 'blocked'
                ? self::FAILURE : self::SUCCESS;
        } catch (Throwable $error) {
            $this->error('Automatic weekly awards stopped: '.$error->getMessage());

            return self::FAILURE;
        }
    }
}
