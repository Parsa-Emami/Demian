<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponLedgerAudit;
use Illuminate\Console\Command;

final class ArcadeAuditCouponsCommand extends Command
{
    protected $signature = 'arcade:audit-coupons {--json : Machine-readable nonsecret ledger summary}';

    protected $description = 'Read-only integrity verification for encrypted coupons, reservations and redemption receipts.';

    public function handle(CouponLedgerAudit $audit): int
    {
        $result = $audit->inspect();
        $this->line($this->option('json')
            ? json_encode($result, JSON_THROW_ON_ERROR)
            : sprintf('Coupon ledger %s: %d codes, %d redemptions, %d issues.',
                $result['status'], $result['coupons'],
                $result['redemptions'], count($result['issues'])));

        return $result['status'] === 'passed' ? self::SUCCESS : self::FAILURE;
    }
}
