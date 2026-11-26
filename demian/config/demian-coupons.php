<?php

return [
    // All financial actions fail closed until the sponsor approves the
    // actual shop contract, discount policy and security/operations rollout.
    'policy_approved' => (bool) env('DEMIAN_COUPONS_POLICY_APPROVED', false),
    'issue_enabled' => (bool) env('DEMIAN_COUPONS_ISSUE_ENABLED', false),
    'campaigns_enabled' => (bool) env('DEMIAN_COUPONS_CAMPAIGNS_ENABLED', false),
    'weekly_budget_minor' => env('DEMIAN_COUPONS_WEEKLY_BUDGET_MINOR', ''),
    'economics_required' => (bool) env('DEMIAN_COUPONS_ECONOMICS_REQUIRED', false),
    // Non-test environments always freeze the allocation policy for new campaigns.
    'dynamic_allocation_required' => (bool) env('DEMIAN_COUPONS_DYNAMIC_ALLOCATION_REQUIRED', false),
    // Step 16: owner acknowledgement and support cases, independently OFF.
    'delivery_support_enabled' => (bool) env('DEMIAN_COUPONS_DELIVERY_SUPPORT_ENABLED', false),
    // Online merchant endpoints are retired; no real e-commerce integration.
    'shop_enabled' => false,
    // Separately gated manual gifts; weekly issuance is an independent switch.
    'manual_gifts_enabled' => (bool) env('DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED', false),
    'gift_max_percent' => 30,
    'gift_max_valid_days' => 30,
    'gift_issuer_daily_limit' => 20,
    'gift_recipient_daily_limit' => 1,
    'cafe_enabled' => (bool) env('DEMIAN_COUPONS_CAFE_ENABLED', false),
    'cafe_receipt_hash_key' => env('DEMIAN_COUPONS_CAFE_RECEIPT_HASH_KEY', ''),
    'cafe_session_hours' => 8,
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
