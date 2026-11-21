<?php

return [
    // SMS remains OFF until the owner approves a provider and privacy terms.
    'enabled' => (bool) env('DEMIAN_IDENTITY_ENABLED', false),
    'required' => (bool) env('DEMIAN_IDENTITY_REQUIRED', false),
    'key' => env('DEMIAN_IDENTITY_HMAC_KEY', ''),
    'gateway_url' => env('DEMIAN_IDENTITY_SMS_URL', ''),
    'gateway_token' => env('DEMIAN_IDENTITY_SMS_TOKEN', ''),
];
