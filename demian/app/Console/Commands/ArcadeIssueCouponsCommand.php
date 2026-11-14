<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponIssuanceService;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeIssueCouponsCommand extends Command
{
    protected $signature = 'arcade:issue-coupons
        {--week= : Sealed period key, e.g. weekly:tehran:2026-11-07}
        {--apply : Explicitly authorize issuing actual redeemable codes}
        {--json : Print non-secret JSON summary}';

    protected $description = 'Issue one encrypted, idempotent voucher for each sealed weekly winner.';

    public function handle(CouponIssuanceService $service): int
    {
        if (! $this->option('apply') || ! $this->option('week')) {
            $this->error('Provide --week=weekly:tehran:YYYY-MM-DD and --apply.');
            return self::FAILURE;
        }
        try {
            $result = $service->issueWeek((string) $this->option('week'));
            if ($this->option('json')) $this->line(json_encode($result, JSON_THROW_ON_ERROR));
            else $this->info(sprintf('Created %d; previously issued %d; %d sealed winners.',
                $result['created'], $result['existing'], $result['winners']));
            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Issuance aborted: '.$e->getMessage());
            return self::FAILURE;
        }
    }
}
