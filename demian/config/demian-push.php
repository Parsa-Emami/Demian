<?php

return [
    'enabled' => filter_var(env('DEMIAN_WEB_PUSH_ENABLED', false), FILTER_VALIDATE_BOOL),
    'subject' => env('DEMIAN_WEB_PUSH_SUBJECT'),
    'public_key' => env('DEMIAN_WEB_PUSH_PUBLIC_KEY'),
    'private_key' => env('DEMIAN_WEB_PUSH_PRIVATE_KEY'),
];
