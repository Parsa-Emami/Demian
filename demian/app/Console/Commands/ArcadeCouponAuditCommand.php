<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponIntegrityAudit;
use Illuminate\Console\Command;

final class ArcadeCouponAuditCommand extends Command
{
    protected $signature = 'arcade:coupons:audit {--json : Machine-readable, nonsecret audit result}';

    protected $description = 'Read-only integrity audit for issued voucher batches and redemption state.';

    public function handle(CouponIntegrityAudit $audit): int
    {
        $result = $audit->inspect();
        $this->line($this->option('json')
            ? json_encode($result, JSON_THROW_ON_ERROR)
            : sprintf('Coupon integrity: %s; %d batches; %d codes; %d captured; %d issues',
                $result['status'], $result['batch_count'], $result['coupon_count'],
                $result['captured_count'], count($result['issues'])));

        return $result['status'] === 'passed' ? self::SUCCESS : self::FAILURE;
    }
}
