<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponLifecycleService;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeRevokeCouponCommand extends Command
{
    protected $signature = 'arcade:coupons:revoke
        {--id= : Internal numeric voucher ID; never enter a plaintext code}
        {--reason= : fraud, policy or incident}
        {--apply : Explicit authorization for irreversible revocation}';

    protected $description = 'Revoke an unspent voucher and clear its encrypted code; never reverse captured orders.';

    public function handle(CouponLifecycleService $service): int
    {
        $id = $this->option('id');
        $reason = $this->option('reason');
        if (! $this->option('apply') || ! is_string($id) || ! ctype_digit($id)
            || (int) $id < 1 || ! in_array($reason, ['fraud', 'policy', 'incident'], true)) {
            $this->error('Use --id=positive-integer --reason=fraud|policy|incident --apply.');
            return self::FAILURE;
        }

        try {
            $result = $service->revoke((int) $id, $reason);
            $this->info(sprintf('Voucher #%d: %s', $result['coupon_id'], $result['status']));
            return self::SUCCESS;
        } catch (Throwable) {
            $this->error('Revocation failed. Check record state and audit history.');
            return self::FAILURE;
        }
    }
}
