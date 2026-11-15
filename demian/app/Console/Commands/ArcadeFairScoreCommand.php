<?php

namespace App\Console\Commands;

use App\Services\Arcade\WeeklyFairScoringService;
use Illuminate\Console\Command;
use Throwable;

/**
 * Opt-in audit/backfill for already sealed technical weeks. Does not settle a
 * week, change winners, recalculate old prizes or issue/void coupons.
 */
final class ArcadeFairScoreCommand extends Command
{
    protected $signature = 'arcade:fair-score
        {--week= : Tehran Saturday YYYY-MM-DD to verify and score}
        {--apply : Explicitly allow creating non-financial scoring snapshots}
        {--json : Print sanitized result}';

    protected $description = 'Verify and create parallel fair-scoring snapshots for historical sealed competitions';

    public function handle(WeeklyFairScoringService $scoring): int
    {
        if (! $this->option('week') || ! $this->option('apply')) {
            $this->warn('Read-only safety gate: explicit --week and --apply required.');
            return self::FAILURE;
        }
        try {
            $key = 'weekly:tehran:'.(string) $this->option('week');
            $result = $scoring->backfillSealed($key);
            if ($this->option('json')) {
                $this->line(json_encode([
                    'period_key' => $key, ...$result,
                ], JSON_THROW_ON_ERROR));
            } else {
                $this->info($key.': '.$result['status']);
            }
            return self::SUCCESS;
        } catch (Throwable $e) {
            // Never print raw identifiers, replay payloads, IPs or stack traces.
            report($e);
            $this->error('Fair-scoring verification failed. Check restricted logs.');
            return self::FAILURE;
        }
    }
}
