<?php

return [
    // All financial actions fail closed until the sponsor approves the
    // actual shop contract, discount policy and security/operations rollout.
    'policy_approved' => (bool) env('DEMIAN_COUPONS_POLICY_APPROVED', false),
    'issue_enabled' => (bool) env('DEMIAN_COUPONS_ISSUE_ENABLED', false),
    'shop_enabled' => (bool) env('DEMIAN_COUPONS_SHOP_ENABLED', false),
    'auto_issue_enabled' => (bool) env('DEMIAN_COUPONS_AUTO_ISSUE_ENABLED', false),
    'policy_version' => env('DEMIAN_COUPONS_POLICY_VERSION', ''),
    // Proposed award tiers; do not change tiers after a week is issued.
    'ranks' => [1 => 30, 2 => 20, 3 => 20, 4 => 10, 5 => 10,
        6 => 10, 7 => 10, 8 => 10, 9 => 10, 10 => 10],
    'currency' => env('DEMIAN_COUPONS_CURRENCY', ''),
    'min_order_minor' => env('DEMIAN_COUPONS_MIN_ORDER_MINOR', ''),
    'max_discount_minor' => env('DEMIAN_COUPONS_MAX_DISCOUNT_MINOR', ''),
    'valid_days' => env('DEMIAN_COUPONS_VALID_DAYS', ''),
    'reservation_minutes' => 15,
    'shop_signing_secret' => env('DEMIAN_COUPONS_SHOP_SIGNING_SECRET', ''),
    'shop_previous_signing_secret' => env('DEMIAN_COUPONS_SHOP_PREVIOUS_SIGNING_SECRET', ''),
    'order_hash_key' => env('DEMIAN_COUPONS_ORDER_HASH_KEY', ''),
    'webhook_skew_seconds' => 300,
];
