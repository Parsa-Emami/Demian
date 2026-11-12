<?php

return [
    'rules_path' => resource_path('game/runner-rules.json'),
    'replay_retention_days' => 30,
    'completion_grace_seconds' => 300,
    // Saturday 00:00 Tehran. Stored run timestamps remain UTC.
    'season_timezone' => 'Asia/Tehran',
    'season_week_start_day' => 6,
    'characters' => ['darya', 'setayesh', 'uzudi', 'negar', 'tiam', 'amirreza', 'hanna', 'ainaz', 'arsal', 'iman', 'amin', 'hossein'],
];
