<?php

namespace App\Console\Commands;

use App\Services\Arcade\WeeklyCompetitionService;
use Illuminate\Console\Command;
use Throwable;

/**
 * Idempotent and harmless to prizes: only current/next period rows and
 * lifecycle audit events are written. Operators must explicitly opt in.
 */
final class ArcadePrepareWeeksCommand extends Command
{
    protected $signature = 'arcade:prepare-weeks
        {--apply : Create current and upcoming Saturday season records}
        {--json : Print public non-sensitive period metadata}';

    protected $description = 'Prepare current and next Tehran weekly competition without settlement or coupons';

    public function handle(WeeklyCompetitionService $competitions): int
    {
        if (! $this->option('apply')) {
            $this->warn('Read-only safety gate: --apply is required to write weekly periods.');
            return self::FAILURE;
        }
        try {
            $periods = $competitions->prepare();
            if ($this->option('json')) {
                $this->line(json_encode(['status'=>'prepared','periods'=>$periods], JSON_THROW_ON_ERROR));
            } else {
                foreach ($periods as $period) {
                    $this->info($period['period_key'].': '.$period['status']);
                }
            }
            return self::SUCCESS;
        } catch (Throwable $e) {
            report($e);
            $this->error('Failed to prepare weekly competition; see restricted logs.');
            return self::FAILURE;
        }
    }
}
