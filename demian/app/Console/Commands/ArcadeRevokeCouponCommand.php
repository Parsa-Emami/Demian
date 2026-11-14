<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponIssuanceService;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeRevokeCouponCommand extends Command
{
    protected $signature = 'arcade:revoke-coupon
        {--id= : Internal coupon ID (not the discount code)}
        {--reason= : fraud, policy or incident}
        {--apply : Confirm permanent revocation}';

    protected $description = 'Revoke an unused coupon with audited reason; cannot undo a redeemed checkout.';

    public function handle(CouponIssuanceService $service): int
    {
        $id = $this->option('id');
        if (! $this->option('apply') || ! is_string($id) || ! ctype_digit($id)
            || (int) $id < 1 || (int) $id > 2147483647) {
            $this->error('Provide a valid --id and --apply; no changes made.');
            return self::FAILURE;
        }
        try {
            $result = $service->revoke((int) $id, (string) $this->option('reason'));
            $this->info($result['status'].': '.$result['coupon_id']);
            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Revocation aborted: '.$e->getMessage());
            return self::FAILURE;
        }
    }
}
