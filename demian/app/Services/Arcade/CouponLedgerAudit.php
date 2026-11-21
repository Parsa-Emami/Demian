<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Read-only verification without rendering vouchers, identifiers or secrets.
 * A failed audit MUST block merchant launch and automatic issuance.
 */
final class CouponLedgerAudit
{
    public function inspect(): array
    {
        $issues = [];
        $coupons = DB::table('arcade_coupons')->orderBy('id')->get();
        $ranks = [1 => 30, 2 => 20, 3 => 20, 4 => 10, 5 => 10,
            6 => 10, 7 => 10, 8 => 10, 9 => 10, 10 => 10];

        foreach ($coupons as $coupon) {
            $id = (int) $coupon->id;
            if ($coupon->source === 'gift') {
                $gift = DB::table('arcade_coupon_gifts')
                    ->where('id', $coupon->gift_id)->first();
                if ($coupon->winner_id !== null || ! $gift
                    || $gift->request_digest === null
                    || ! preg_match('/^[a-f0-9]{64}$/D', $gift->request_digest)
                    || ($coupon->player_id !== null
                        && $gift->player_id !== $coupon->player_id)
                    || (int) $coupon->discount_percent < 1
                    || (int) $coupon->discount_percent > 30
                    || (int) $coupon->min_order_minor < 1
                    || (int) $coupon->max_discount_minor < 1
                    || $coupon->expires_at <= $coupon->issued_at
                    || ! DB::table('arcade_cashier_staff')
                        ->where('id', $gift?->issuer_id)->exists()
                    || ! DB::table('arcade_cashier_admin_events')
                        ->where('actor_id', $gift?->issuer_id)
                        ->where('event_type', 'coupon_gift_issued')
                        ->where('details->gift_id', $gift?->id)->exists()) {
                    $issues[] = "Coupon #{$id} has invalid manual gift provenance.";
                }
            } elseif ($coupon->source === 'weekly') {
                $winner = DB::table('arcade_weekly_winners')
                    ->where('id', $coupon->winner_id)->first();
                $period = $winner ? DB::table('arcade_weekly_periods')
                    ->where('period_key', $winner->period_key)->first() : null;
                $campaign = $coupon->campaign_id
                    ? DB::table('arcade_reward_campaigns')->where('id', $coupon->campaign_id)->first()
                    : null;
                $terms = $campaign
                    ? json_decode($campaign->terms, true) : null;
                $inventory = $campaign
                    ? DB::table('arcade_reward_inventory')
                        ->where('coupon_id', $id)->first() : null;
                $expectedRate = $terms
                    ? ($terms['ranks'][(int) ($winner->prize_rank ?? 0)] ?? null)
                    : ($ranks[(int) ($winner->prize_rank ?? 0)] ?? null);
                if ($coupon->campaign_id !== null
                    && (! $campaign || ! $terms
                        || ! hash_equals($campaign->terms_hash, RewardCampaignService::termsDigest($campaign->terms))
                        || $campaign->period_key !== ($winner->period_key ?? null)
                        || ! $inventory || $inventory->status !== 'assigned'
                        || $inventory->code_ciphertext !== null
                        || $inventory->code_hash !== $coupon->code_hash
                        || $inventory->campaign_id !== $coupon->campaign_id
                        || $coupon->policy_version !== ($terms['version'] ?? null)
                        || $coupon->currency !== ($terms['currency'] ?? null)
                        || (int) $coupon->min_order_minor !== (int) ($terms['min_order_minor'] ?? 0)
                        || (int) $coupon->max_discount_minor !== (int) ($terms['max_discount_minor'] ?? 0))) {
                    $issues[] = "Coupon #{$id} has invalid campaign inventory provenance.";
                }
                if ($coupon->gift_id !== null || ! $winner || ! $period
                    || $period->status !== 'sealed'
                    || $period->snapshot_hash === null
                    || ($coupon->player_id !== null && $coupon->player_id !== $winner->player_id)
                    || $expectedRate === null
                    || (int) $coupon->discount_percent !== (int) $expectedRate) {
                    $issues[] = "Coupon #{$id} has an invalid archived winner or policy.";
                }
            } else {
                $issues[] = "Coupon #{$id} has an unknown issuance source.";
            }
            $status = $coupon->status;
            if (! in_array($status, ['issued', 'reserved', 'redeemed', 'revoked'], true)) {
                $issues[] = "Coupon #{$id} has an unknown state.";
            }

            // Verify the encrypted capability without outputting it.
            if ($coupon->code_ciphertext !== null) {
                try {
                    $secret = Crypt::decryptString($coupon->code_ciphertext);
                    if (! preg_match('/^DMC-[A-F0-9]{32}$/D', $secret)
                        || ! hash_equals($coupon->code_hash, hash('sha256', $secret))) {
                        $issues[] = "Coupon #{$id} secret integrity mismatch.";
                    }
                } catch (\Throwable) {
                    $issues[] = "Coupon #{$id} cannot be decrypted.";
                }
            } elseif ($status !== 'revoked' && ! ($status === 'redeemed' && $coupon->player_id === null)) {
                $issues[] = "Coupon #{$id} has unexpected missing encrypted data.";
            }
            if ($status === 'revoked' && $coupon->code_ciphertext !== null) {
                $issues[] = "Revoked coupon #{$id} retains a recoverable secret.";
            }
            if ($coupon->player_id === null && in_array($status, ['issued', 'reserved'], true)) {
                $issues[] = "Erased player coupon #{$id} remains spendable.";
            }

            $holds = DB::table('arcade_coupon_reservations')
                ->where('coupon_id', $id)->get();
            $active = $holds->where('status', 'reserved');
            $committed = $holds->where('status', 'committed');
            $receipts = DB::table('arcade_coupon_redemptions')
                ->where('coupon_id', $id)->get();
            if ($active->count() > 1 || $committed->count() > 1 || $receipts->count() > 1
                || ($status === 'reserved'
                    && ($active->count() !== 1
                        || (int) $coupon->active_reservation_id !== (int) $active->first()?->id))
                || ($status === 'issued' && ($active->count() !== 0 || $receipts->count() !== 0))
                || ($status === 'revoked' && $active->count() !== 0)
                || ($status === 'redeemed' && $receipts->count() !== 1)
                || ($status === 'redeemed' && $receipts->first()?->channel === 'shop'
                    && ($committed->count() !== 1
                        || $receipts->first()?->order_hash !== $committed->first()?->order_hash))
                || ($status === 'redeemed' && $receipts->first()?->channel === 'in_cafe'
                    && ($committed->count() !== 0 || $active->count() !== 0
                        || $receipts->first()?->reservation_id !== null
                        || ! DB::table('arcade_cashier_requests')
                            ->where('coupon_id', $id)
                            ->where('redemption_id', $receipts->first()?->id)
                            ->where('cashier_id', $receipts->first()?->cashier_id)
                            ->where('ticket_hash', $receipts->first()?->order_hash)->exists()
                        || ! DB::table('arcade_cashier_staff')
                            ->where('id', $receipts->first()?->cashier_id)
                            ->where('branch_id', $receipts->first()?->branch_id)->exists()
                        || ! DB::table('arcade_coupon_events')
                            ->where('coupon_id', $id)
                            ->where('event_type', 'redeemed_in_cafe')->exists()))) {
                $issues[] = "Coupon #{$id} reservation/redemption ledger mismatch.";
            }
            if (! DB::table('arcade_coupon_events')->where('coupon_id', $id)
                ->where('event_type', 'issued')->exists()) {
                $issues[] = "Coupon #{$id} has no issuance audit event.";
            }
        }

        foreach (DB::table('arcade_reward_campaigns')->orderBy('id')->get() as $campaign) {
            try {
                app(CampaignEconomics::class)->assertIssuance($campaign, 0);
                $period = DB::table('arcade_weekly_periods')->where('period_key', $campaign->period_key)->first();
                if ($period && $period->status === 'sealed') {
                    $winners = DB::table('arcade_weekly_winners')->where('period_key', $campaign->period_key)->get();
                    // Account erasure preserves historical rows but nulls identifiers; do not treat lawful erasure as tampering.
                    if ($winners->every(fn ($w) => $w->player_id !== null && $w->run_id !== null)) {
                        app(WeeklyAllocationService::class)->assertSealed($campaign, $winners);
                    }
                }
                $report = app(CampaignEconomics::class)->report($campaign);
                if ($report['economics']) {
                    $receipts = DB::table('arcade_coupon_redemptions as r')
                        ->join('arcade_coupons as c', 'c.id', '=', 'r.coupon_id')
                        ->where('c.campaign_id', $campaign->id)
                        ->get(['r.subtotal_minor', 'r.discount_minor', 'r.currency', 'c.currency as coupon_currency',
                            'c.min_order_minor', 'c.max_discount_minor', 'c.discount_percent']);
                    foreach ($receipts as $receipt) {
                        $subtotal = (int) $receipt->subtotal_minor;
                        $discount = (int) $receipt->discount_minor;
                        if ($receipt->currency !== $receipt->coupon_currency || $subtotal < (int) $receipt->min_order_minor
                            || $discount !== min(CampaignEconomics::floorBps($subtotal, (int) $receipt->discount_percent * 100), (int) $receipt->max_discount_minor)
                            || ! app(CampaignEconomics::class)->marginSafe($subtotal, $discount, $report['economics'])) {
                            $issues[] = "Campaign #{$campaign->id} invalid financial redemption.";
                            break;
                        }
                    }
                }
                if ($report['economics'] && ($report['discount_minor'] > $report['committed_minor']
                    || $report['discount_minor'] + $report['outstanding_minor'] > $report['economics']['budget_minor'])) {
                    $issues[] = "Campaign #{$campaign->id} exceeds its frozen financial liability.";
                }
            } catch (\Throwable) {
                $issues[] = "Campaign #{$campaign->id} financial plan integrity failure.";
            }
        }

        foreach (DB::table('arcade_reward_inventory')->get() as $item) {
            if ($item->status === 'available'
                && ($item->coupon_id !== null || $item->code_ciphertext === null)) {
                $issues[] = "Inventory #{$item->id} is not safely available.";
            } elseif ($item->status === 'available') {
                try {
                    $plaintext = Crypt::decryptString($item->code_ciphertext);
                    if (! preg_match('/^DMC-[A-F0-9]{32}$/D', $plaintext)
                        || ! hash_equals($item->code_hash, hash('sha256', $plaintext))) {
                        $issues[] = "Inventory #{$item->id} checksum mismatch.";
                    }
                } catch (\Throwable) {
                    $issues[] = "Inventory #{$item->id} cannot be decrypted.";
                }
            } elseif ($item->status === 'assigned'
                && ($item->coupon_id === null || $item->code_ciphertext !== null
                    || ! DB::table('arcade_coupons')->where('id', $item->coupon_id)
                        ->where('campaign_id', $item->campaign_id)
                        ->where('code_hash', $item->code_hash)->exists())) {
                $issues[] = "Inventory #{$item->id} has an invalid assignment.";
            } elseif ($item->status === 'void'
                && ($item->coupon_id !== null || $item->code_ciphertext !== null)) {
                $issues[] = "Inventory #{$item->id} retains voided code material.";
            } elseif (! in_array($item->status, ['available', 'assigned', 'void'], true)) {
                $issues[] = "Inventory #{$item->id} has unknown state.";
            }
        }

        // Every gift provenance row must correspond to exactly one coupon.
        // The DB UNIQUE(gift_id) blocks doubles; this detects missing links.
        $giftCount = DB::table('arcade_coupon_gifts')->count();
        $giftCouponCount = DB::table('arcade_coupons')
            ->where('source', 'gift')->count();
        if ($giftCount !== $giftCouponCount) {
            $issues[] = 'Manual gift attribution count mismatch.';
        }

        return [
            'status' => $issues ? 'failed' : 'passed',
            'coupons' => $coupons->count(),
            'manual_gifts' => DB::table('arcade_coupon_gifts')->count(),
            'redemptions' => DB::table('arcade_coupon_redemptions')->count(),
            'shop_events' => DB::table('arcade_coupon_shop_requests')->count(),
            'cafe_redemptions' => DB::table('arcade_coupon_redemptions')
                ->where('channel', 'in_cafe')->count(),
            'issues' => $issues,
        ];
    }
}
