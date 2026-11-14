<?php

namespace App\Services\Arcade;

use RuntimeException;

/** Immutable, explicit financial policy loaded at issuance time. */
final class CouponPolicy
{
    public function approved(): array
    {
        if (config('demian-coupons.policy_approved') !== true) {
            throw new RuntimeException('Coupon policy approval is required.');
        }

        $version = config('demian-coupons.policy_version');
        $currency = config('demian-coupons.currency');
        $ranks = config('demian-coupons.ranks');
        if (! is_string($version) || ! preg_match('/^[a-z][a-z0-9.-]{2,39}$/D', $version)
            || ! is_string($currency) || ! preg_match('/^[A-Z]{3}$/D', $currency)
            || ! is_array($ranks) || array_keys($ranks) !== range(1, 10)
            || array_values($ranks) !== [30, 20, 20, 10, 10, 10, 10, 10, 10, 10]) {
            throw new RuntimeException('Incomplete or unapproved coupon policy version/ranks/currency.');
        }

        $minimum = $this->wholeNumber('min_order_minor', 1, 1000000000000);
        $maximum = $this->wholeNumber('max_discount_minor', 1, 1000000000000);
        $days = $this->wholeNumber('valid_days', 1, 365);

        return [
            'version' => $version, 'currency' => $currency,
            'ranks' => $ranks, 'min_order_minor' => $minimum,
            'max_discount_minor' => $maximum, 'valid_days' => $days,
        ];
    }

    private function wholeNumber(string $name, int $lower, int $upper): int
    {
        $raw = config('demian-coupons.'.$name);
        if ((! is_int($raw) && ! is_string($raw))
            || ! preg_match('/^[0-9]{1,13}$/D', (string) $raw)) {
            throw new RuntimeException('Missing or invalid coupon policy: '.$name);
        }
        $number = (int) $raw;
        if ($number < $lower || $number > $upper) {
            throw new RuntimeException('Coupon policy out of range: '.$name);
        }

        return $number;
    }
}
