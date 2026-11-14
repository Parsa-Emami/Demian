<?php

namespace App\Console\Commands;

use App\Services\Arcade\WeeklySettlementService;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeSealWeeksCommand extends Command
{
    protected $signature = 'arcade:seal-weeks
        {--week= : Explicit Tehran Saturday YYYY-MM-DD for manual backfill}
        {--apply : Authorize permanent weekly snapshot and award allocation}
        {--json : Print machine-readable result}';

    protected $description = 'Atomically seal completed Tehran weeks; snapshot ranks and selected winners without issuing coupons.';

    public function handle(WeeklySettlementService $service): int
    {
        if (! $this->option('apply')) {
            $this->warn('Read-only safety gate: add --apply to seal immutable weekly results.');
            return self::FAILURE;
        }

        try {
            $results = $this->option('week')
                ? [$service->seal((string) $this->option('week'))]
                : $service->sealPending();
            if ($this->option('json')) {
                $this->line(json_encode(['status' => 'ok', 'results' => $results], JSON_THROW_ON_ERROR));
            } else {
                foreach ($results as $result) {
                    $this->info(sprintf('%s: %s (%d ranked, %d selected)',
                        $result['period_key'], $result['status'], $result['participants'], $result['winners']));
                }
                if (! $results) $this->info('No unsealed completed weeks.');
            }

            return self::SUCCESS;
        } catch (Throwable $e) {
            // Do not expose tokens, player identifiers or stack traces.
            $this->error('Weekly seal aborted: '.$e->getMessage());
            return self::FAILURE;
        }
    }
}
