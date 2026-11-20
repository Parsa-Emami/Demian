<?php

return [
    'enabled' => filter_var(env('DEMIAN_TABLES_ENABLED',false),FILTER_VALIDATE_BOOL),
    'public_base' => env('DEMIAN_TABLE_PUBLIC_BASE',''),
    'game_url' => env('DEMIAN_TABLE_GAME_URL',''),
];
