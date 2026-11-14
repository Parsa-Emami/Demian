<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/** Read-only, nonsecret Phase-8 issuance and redemption integrity check. */
final class CouponIntegrityAudit
{
    public function inspect(): array
    {
        $problems = [];
        $batches = DB::table('arcade_reward_batches')->orderBy('period_key')->get();
        foreach ($batches as $batch) {
            $period = DB::table('arcade_weekly_periods')->where('period_key', $batch->period_key)->first();
            if (! $period || $period->status !== 'sealed'
                || $period->snapshot_hash !== $batch->settlement_hash) {
                $problems[] = 'Batch refers to missing or changed seal: '.$batch->period_key;
            }
            $policy = json_decode($batch->policy_snapshot, true);
            if (! is_array($policy) || hash('sha256', $batch->policy_snapshot) !== $batch->policy_hash) {
                $problems[] = 'Batch policy changed: '.$batch->period_key;
                continue;
            }
            $coupons = DB::table('arcade_coupons')->where('period_key', $batch->period_key)
                ->orderBy('id')->get();
            if (count($coupons) !== (int) $batch->coupon_count
                || count($coupons) !== (int) $period?->winner_count) {
                $problems[] = 'Batch count mismatch: '.$batch->period_key;
            }
            foreach ($coupons as $coupon) {
                $winner = DB::table('arcade_weekly_winners')->where('id', $coupon->winner_id)->first();
                if (! $winner || $winner->period_key !== $coupon->period_key
                    || $winner->game_id !== $coupon->game_id
                    || (int) $winner->prize_rank !== (int) $coupon->prize_rank
                    || ($coupon->player_id !== null && $winner->player_id !== $coupon->player_id)
                    || (int) ($policy['tiers'][$coupon->prize_rank] ?? -1) !== (int) $coupon->percent_off) {
                    $problems[] = 'Coupon differs from sealed winner: #'.$coupon->id;
                }
                if ($coupon->code_ciphertext !== null) {
                    try {
                        $code = Crypt::decryptString($coupon->code_ciphertext);
                        if (! hash_equals($coupon->code_hash, hash('sha256', $code))) {
                            $problems[] = 'Coupon secret digest mismatched: #'.$coupon->id;
                        }
                    } catch (\Throwable) {
                        $problems[] = 'Coupon decryption failed: #'.$coupon->id;
                    }
                } elseif ($coupon->status !== 'revoked' && $coupon->player_id !== null) {
                    $problems[] = 'Active owner has missing coupon secret: #'.$coupon->id;
                }
                $reservations = DB::table('arcade_coupon_reservations')->where('coupon_id', $coupon->id)->get();
                $active = $reservations->where('state', 'reserved')->count();
                $captured = $reservations->where('state', 'captured')->count();
                if ($active > 1 || $captured > 1
                    || ($coupon->status === 'reserved' && $active !== 1)
                    || ($coupon->status === 'available' && ($active !== 0 || $captured !== 0))
                    || ($coupon->status === 'redeemed' && $captured !== 1)
                    || ($coupon->status === 'revoked' && $active !== 0)) {
                    $problems[] = 'Coupon reservation state mismatch: #'.$coupon->id;
                }
                $events = DB::table('arcade_coupon_events')
                    ->where('coupon_id', $coupon->id)->count();
                if ($events === 0) {
                    $problems[] = 'Missing audit history: #'.$coupon->id;
                }
            }
        }

        return [
            'status' => $problems ? 'failed' : 'passed',
            'batch_count' => $batches->count(),
            'coupon_count' => DB::table('arcade_coupons')->count(),
            'captured_count' => DB::table('arcade_coupons')->where('status', 'redeemed')->count(),
            'issues' => $problems,
        ];
    }
}
