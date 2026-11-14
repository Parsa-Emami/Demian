<?php

return [
    'rules_path' => resource_path('game/runner-rules.json'),
    'api_only' => env('DEMIAN_ARCADE_API_ONLY', false),
    'replay_retention_days' => 30,
    'completion_grace_seconds' => 300,
    // An absolute limit on bearer capabilities, not a refresh-token grant.
    'player_session_days' => 30,
    'recovery_link_minutes' => 20,
    // Manually saved, single-use long-term backup capability for anonymous accounts.
    'backup_code_days' => 180,
    'characters' => ['darya', 'setayesh', 'uzudi', 'negar', 'tiam', 'amirreza', 'hanna', 'ainaz', 'arsal', 'iman', 'amin', 'hossein'],
];
