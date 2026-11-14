<?php

namespace App\Console\Commands;

use App\Services\Arcade\CouponIssuanceService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

final class ArcadeIssuePendingCouponsCommand extends Command
{
    protected $signature = 'arcade:issue-pending-coupons
        {--apply : Explicitly authorize issuing redeemable coupons}
        {--limit=26 : Maximum unissued sealed weeks per invocation}';

    protected $description = 'Issue any missing vouchers for sealed weekly winners, oldest week first.';

    public function handle(CouponIssuanceService $service): int
    {
        $limit = $this->option('limit');
        if (! $this->option('apply') || ! is_numeric($limit)
            || ! preg_match('/^[0-9]{1,2}$/D', (string) $limit)
            || (int) $limit < 1 || (int) $limit > 26) {
            $this->error('Provide --apply and --limit between 1 and 26.');
            return self::FAILURE;
        }
        try {
            $pending = DB::table('arcade_weekly_periods as p')->where('p.status', 'sealed')
                ->whereExists(function ($query): void {
                    $query->selectRaw('1')->from('arcade_weekly_winners as w')
                        ->whereColumn('w.period_key', 'p.period_key')
                        ->whereNotExists(function ($unused): void {
                            $unused->selectRaw('1')->from('arcade_coupons as c')
                                ->whereColumn('c.winner_id', 'w.id');
                        });
                })->orderBy('p.starts_at')->limit((int) $limit)->pluck('p.period_key');
            foreach ($pending as $week) {
                $result = $service->issueWeek($week);
                $this->info($week.': '.$result['created'].' issued; '.$result['existing'].' existing.');
            }
            if ($pending->isEmpty()) $this->info('No eligible pending sealed winners.');
            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('Pending coupon issuance aborted: '.$e->getMessage());
            return self::FAILURE;
        }
    }
}
