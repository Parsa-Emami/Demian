<?php

return [
    // Both switches are OFF until merchant integration, migration, policy and
    // monetary limits are independently approved in staging and production.
    'issuance_enabled' => (bool) env('DEMIAN_COUPON_ISSUANCE_ENABLED', false),
    'store_enabled' => (bool) env('DEMIAN_COUPON_STORE_ENABLED', false),
    'policy_approved' => (bool) env('DEMIAN_COUPON_POLICY_APPROVED', false),
    'currency' => env('DEMIAN_COUPON_CURRENCY', ''),
    'valid_days' => (int) env('DEMIAN_COUPON_VALID_DAYS', 0),
    'minimum_minor' => (int) env('DEMIAN_COUPON_MINIMUM_MINOR', -1),
    'cap_minor' => (int) env('DEMIAN_COUPON_CAP_MINOR', 0),
    'tiers' => [1 => 30, 2 => 20, 3 => 20, 4 => 10, 5 => 10,
        6 => 10, 7 => 10, 8 => 10, 9 => 10, 10 => 10],
    'store_id' => env('DEMIAN_COUPON_STORE_ID', ''),
    // 64-character hex key (32 random bytes), distinct from APP_KEY.
    'store_hmac_key' => env('DEMIAN_COUPON_STORE_HMAC_KEY', ''),
    'signature_skew_seconds' => 300,
    'reserve_minutes' => 15,
];
