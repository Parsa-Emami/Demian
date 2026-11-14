<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponIssuanceService;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeIssueCouponsCommand extends Command
{
    protected $signature = 'arcade:coupons:issue
        {--week= : A completed Tehran Saturday in YYYY-MM-DD format}
        {--pending : Process unissued sealed weeks in chronological order}
        {--apply : Explicitly authorize irreversible batch issuance}
        {--json : Print only nonsecret batch status}';

    protected $description = 'Issue encrypted reward codes for sealed weekly winners; never output coupon plaintext.';

    public function handle(CouponIssuanceService $issuer): int
    {
        if (! $this->option('apply') || ((bool) $this->option('week') === (bool) $this->option('pending'))) {
            $this->error('Use --apply and exactly one of --week=YYYY-MM-DD or --pending.');
            return self::FAILURE;
        }
        $week = (string) $this->option('week');
        if ($week !== '' && ! preg_match('/^\d{4}-\d{2}-\d{2}$/D', $week)) {
            $this->error('Invalid Tehran week.');
            return self::FAILURE;
        }

        try {
            $results = $this->option('pending')
                ? $issuer->issuePending()
                : [$issuer->issue('weekly:tehran:'.$week)];
            $this->line($this->option('json')
                ? json_encode(['results' => $results], JSON_THROW_ON_ERROR)
                : sprintf('Processed %d sealed batches; no plaintext codes displayed.', count($results)));
            return self::SUCCESS;
        } catch (Throwable $e) {
            // Do not write exception messages from crypto/DB containing keys.
            $this->error('Issuance failed. Verify sealed period, approved policy, and database health.');
            return self::FAILURE;
        }
    }
}
