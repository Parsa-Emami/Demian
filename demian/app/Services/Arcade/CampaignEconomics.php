<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class CampaignEconomics
{
    public const RECOMMENDED_RATES = [1 => 20, 2 => 15, 3 => 12, 4 => 8, 5 => 8,
        6 => 8, 7 => 8, 8 => 8, 9 => 8, 10 => 8];
    public const FIELDS = [
        'budget_minor' => [1, 200000000000000],
        'cost_ceiling_bps' => [0, 9999],
        'margin_floor_bps' => [1, 9999],
        'incremental_share_bps' => [0, 10000],
        'planned_operating_minor' => [0, 200000000000000],
    ];

    public function required(): bool
    {
        return ! app()->environment('testing')
            || config('demian-coupons.economics_required') === true;
    }

    private static function integer(mixed $value, int $min, int $max): int
    {
        if ((! is_int($value) && ! is_string($value))
            || ! preg_match('/^[0-9]{1,15}$/D', (string) $value)
            || (int) $value < $min || (int) $value > $max) {
            throw new RuntimeException('Invalid campaign financial input.');
        }
        return (int) $value;
    }

    public static function floorBps(int $amount, int $bps): int
    {
        return intdiv($amount, 10000) * $bps + intdiv(($amount % 10000) * $bps, 10000);
    }

    public static function ceilBps(int $amount, int $bps): int
    {
        return intdiv($amount, 10000) * $bps + intdiv(($amount % 10000) * $bps + 9999, 10000);
    }

    public function ceiling(): int
    {
        return self::integer(config('demian-coupons.weekly_budget_minor'), 1, 200000000000000);
    }

    public function fromInput(array $input, array $terms, int $capacity): ?array
    {
        $present = array_filter(array_intersect_key($input, self::FIELDS),
            static fn ($value) => $value !== null && $value !== '');
        if (! $present && ! $this->required()) return null;
        $economics = ['schema' => 1, 'capacity' => $capacity];
        foreach (self::FIELDS as $field => [$min, $max]) {
            $economics[$field] = self::integer($input[$field] ?? null, $min, $max);
        }
        $this->assertPlan($terms, $economics, $capacity);
        if ($economics['budget_minor'] > $this->ceiling()) {
            throw new RuntimeException('Campaign exceeds the owner-approved weekly budget ceiling.');
        }
        return $economics;
    }

    public function canonical(array $economics): array
    {
        if (($economics['schema'] ?? null) !== 1) {
            throw new RuntimeException('Unknown campaign economics schema.');
        }
        $result = ['schema' => 1, 'capacity' => self::integer($economics['capacity'] ?? null, 1, 200)];
        foreach (self::FIELDS as $field => [$min, $max]) {
            $result[$field] = self::integer($economics[$field] ?? null, $min, $max);
        }
        if (count($economics) !== count($result)) {
            throw new RuntimeException('Unexpected campaign economics fields.');
        }
        return $result;
    }

    public function assertPlan(array $terms, array $economics, int $capacity): void
    {
        $e = $this->canonical($economics);
        $cap = self::integer($terms['max_discount_minor'] ?? null, 1, 1000000000000);
        $minimum = self::integer($terms['min_order_minor'] ?? null, 1, 1000000000000);
        if ($e['capacity'] !== $capacity || $cap * $capacity > $e['budget_minor']) {
            throw new RuntimeException('Maximum promised discount liability exceeds the weekly budget.');
        }
        if (! isset($terms['ranks']) || ! is_array($terms['ranks']) || count($terms['ranks']) !== 10) {
            throw new RuntimeException('Invalid campaign discount tiers.');
        }
        foreach (range(1, 10) as $rank) {
            $rate = self::integer($terms['ranks'][$rank] ?? null, 1, 30);
            $discount = min(self::floorBps($minimum, $rate * 100), $cap);
            if ($discount < 1 || ! $this->marginSafe($minimum, $discount, $e)) {
                throw new RuntimeException('Minimum purchase and discount terms violate the approved contribution margin floor.');
            }
        }
        $scenario = $this->projection($terms, $e);
        if ($scenario['net_incremental_minor'] < 0) {
            throw new RuntimeException('Campaign fails the approved full-redemption minimum-basket break-even scenario.');
        }
    }

    public function projection(array $terms, array $e): array
    {
        $minimum = (int) $terms['min_order_minor'];
        $capacity = $e['capacity'];
        $gross = $minimum * $capacity;
        $discount = min(self::floorBps($minimum, max($terms['ranks']) * 100), (int) $terms['max_discount_minor']) * $capacity;
        return [
            'gross_minor' => $gross,
            'discount_minor' => $discount,
            'maximum_liability_minor' => (int) $terms['max_discount_minor'] * $capacity,
            ...$this->scenario($gross, $discount, $e, self::ceilBps($minimum, $e['cost_ceiling_bps']) * $capacity),
        ];
    }

    public function marginSafe(int $subtotal, int $discount, array $economics): bool
    {
        if ($subtotal < 1 || $subtotal > 1000000000000 || $discount < 1 || $discount >= $subtotal) return false;
        $net = $subtotal - $discount;
        $cost = self::ceilBps($subtotal, $economics['cost_ceiling_bps']);
        return $net - $cost >= self::ceilBps($net, $economics['margin_floor_bps']);
    }

    public function scenario(int $subtotal, int $discount, array $e, ?int $cost = null): array
    {
        $cost ??= self::ceilBps($subtotal, $e['cost_ceiling_bps']);
        $contribution = $subtotal - $cost;
        $incremental = self::floorBps(max(0, $contribution), $e['incremental_share_bps']);
        $investment = $discount + $e['planned_operating_minor'];
        $net = $incremental - $investment;
        return [
            'estimated_variable_cost_minor' => $cost,
            'estimated_coupon_order_contribution_minor' => $contribution - $discount,
            'assumed_incremental_contribution_minor' => $incremental,
            'net_incremental_minor' => $net,
            'roi_percent' => self::roi($net, $investment),
            'break_even_share_percent' => $contribution > 0
                ? round(100 * $investment / $contribution, 2) : null,
        ];
    }

    public static function roi(int $net, int $investment): ?float
    {
        return $investment > 0 ? round(100 * $net / $investment, 2) : null;
    }

    public function frozen(object $campaign, bool $forNewIssuance = false): ?array
    {
        $terms = json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR);
        if (! hash_equals($campaign->terms_hash, RewardCampaignService::termsDigest($terms))) {
            throw new RuntimeException('Frozen campaign terms checksum mismatch.');
        }
        if (! array_key_exists('economics', $terms)) {
            if ($forNewIssuance && $this->required()) {
                throw new RuntimeException('An approved frozen campaign economics plan is required.');
            }
            return null;
        }
        $e = $this->canonical($terms['economics']);
        $this->assertPlan($terms, $e, (int) $campaign->max_awards);
        if ($forNewIssuance && $e['budget_minor'] > $this->ceiling()) {
            throw new RuntimeException('Frozen campaign exceeds the current owner-approved weekly ceiling.');
        }
        return $e;
    }

    public function assertIssuance(object $campaign, int $missing): void
    {
        $e = $this->frozen($campaign, $missing > 0);
        if (! $e) return;
        $terms = json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR);
        $issued = DB::table('arcade_coupons')->where('campaign_id', $campaign->id);
        $count = (int) (clone $issued)->count();
        $committed = (int) (clone $issued)->sum('max_discount_minor');
        if ($missing < 0 || $count + $missing > $e['capacity']
            || $committed + $missing * (int) $terms['max_discount_minor'] > $e['budget_minor']) {
            throw new RuntimeException('Weekly campaign financial commitment exceeded.');
        }
    }

    public function assertRedemption(object $coupon, int $subtotal, int $discount): void
    {
        if ($coupon->campaign_id === null) return;
        $campaign = DB::table('arcade_reward_campaigns')->where('id', $coupon->campaign_id)->first();
        if (! $campaign) throw new RuntimeException('Coupon campaign is missing.');
        $e = $this->frozen($campaign);
        if (! $e) return;
        $terms = json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR);
        $rank = DB::table('arcade_weekly_winners')->where('id', $coupon->winner_id)->value('prize_rank');
        if ($coupon->currency !== $terms['currency']
            || (int) $coupon->min_order_minor !== $terms['min_order_minor']
            || (int) $coupon->max_discount_minor !== $terms['max_discount_minor']
            || (int) $coupon->discount_percent !== ($terms['ranks'][(int) $rank] ?? null)) {
            throw new RuntimeException('Coupon terms differ from the frozen financial plan.');
        }
        abort_unless($this->marginSafe($subtotal, $discount, $e), 422,
            'Bill does not meet the approved contribution-margin guard.');
    }

    public function report(object $campaign): array
    {
        $e = $this->frozen($campaign);
        $coupons = DB::table('arcade_coupons')->where('campaign_id', $campaign->id);
        $issued = (int) (clone $coupons)->count();
        $committed = (int) (clone $coupons)->sum('max_discount_minor');
        $outstanding = (clone $coupons)->whereIn('status', ['issued', 'reserved'])
            ->where('expires_at', '>', now()->utc()->toDateTimeString());
        $outstandingCount = (int) (clone $outstanding)->count();
        $outstandingMinor = (int) $outstanding->sum('max_discount_minor');
        $receipts = DB::table('arcade_coupon_redemptions as r')->join('arcade_coupons as c', 'c.id', '=', 'r.coupon_id')
            ->where('c.campaign_id', $campaign->id);
        $totals = (clone $receipts)->selectRaw('COUNT(*) AS n, COALESCE(SUM(r.subtotal_minor),0) AS gross, COALESCE(SUM(r.discount_minor),0) AS discount')->first();
        $gross = (int) $totals->gross;
        $discount = (int) $totals->discount;
        $redeemed = (int) $totals->n;
        $estimatedCost = 0;
        if ($e) {
            foreach ($receipts->select('r.subtotal_minor')->cursor() as $receipt) {
                $estimatedCost += self::ceilBps((int) $receipt->subtotal_minor, $e['cost_ceiling_bps']);
            }
        }
        $measurement = DB::table('arcade_reward_campaign_events')->where('campaign_id', $campaign->id)
            ->where('event_type', 'economics_measured')->orderByDesc('id')->first();
        $actual = null;
        if ($measurement) {
            $m = json_decode($measurement->details, true, 512, JSON_THROW_ON_ERROR);
            if (($m['discount_minor'] ?? null) === $discount && ($m['redeemed_count'] ?? null) === $redeemed
                && ($m['issued_count'] ?? null) === $issued && ($m['gross_minor'] ?? null) === $gross && $outstandingCount === 0
                && $campaign->status === 'closed') {
                $investment = $discount + $m['operating_minor'];
                $net = $m['incremental_contribution_minor'] - $investment;
                $actual = [...$m, 'recorded_at' => $measurement->created_at, 'net_incremental_minor' => $net,
                    'roi_percent' => self::roi($net, $investment)];
            }
        }
        return [
            'economics' => $e, 'issued_count' => $issued, 'committed_minor' => $committed,
            'outstanding_count' => $outstandingCount, 'outstanding_minor' => $outstandingMinor,
            'redeemed_count' => $redeemed, 'gross_minor' => $gross, 'discount_minor' => $discount,
            'net_sales_minor' => $gross - $discount,
            'redemption_percent' => $issued > 0 ? round(100 * $redeemed / $issued, 2) : null,
            'budget_remaining_minor' => $e ? $e['budget_minor'] - $committed : null,
            'scenario' => $e ? $this->scenario($gross, $discount, $e, $estimatedCost) : null,
            'projection' => $e ? $this->projection(json_decode($campaign->terms, true, 512, JSON_THROW_ON_ERROR), $e) : null,
            'measurement' => $actual,
        ];
    }
}
