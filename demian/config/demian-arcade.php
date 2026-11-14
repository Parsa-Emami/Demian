<?php

return [
    'rules_path' => resource_path('game/runner-rules.json'),
    // Reward-bearing Critters trials are opt-in only after end-to-end UAT.
    'critters_ranked_enabled' => (bool) env('DEMIAN_ARCADE_CRITTERS_RANKED_ENABLED', false),
    'coffee_ranked_enabled' => (bool) env('DEMIAN_ARCADE_COFFEE_RANKED_ENABLED', false),
    // Financial prize acceptance is independent from public verified rankings.
    'critters_prizes_enabled' => (bool) env('DEMIAN_ARCADE_CRITTERS_PRIZES_ENABLED', false),
    'coffee_prizes_enabled' => (bool) env('DEMIAN_ARCADE_COFFEE_PRIZES_ENABLED', false),
    // Separate opt-in for bounded route-trials; casual game scores stay local.
    'route_ranked_enabled' => [
        'after-hours' => (bool) env('DEMIAN_AFTER_HOURS_ROUTE_RANKED', false),
        'cafe-rush' => (bool) env('DEMIAN_CAFE_RUSH_ROUTE_RANKED', false),
        'open-world' => (bool) env('DEMIAN_OPEN_WORLD_ROUTE_RANKED', false),
    ],
    // Legacy operator variables are intentionally NON-OPERATIVE: route-only proofs
    // are not certified original-game scores, so even true cannot issue coupons.
    'route_prizes_enabled' => [
        'after-hours' => (bool) env('DEMIAN_AFTER_HOURS_ROUTE_PRIZES', false),
        'cafe-rush' => (bool) env('DEMIAN_CAFE_RUSH_ROUTE_PRIZES', false),
        'open-world' => (bool) env('DEMIAN_OPEN_WORLD_ROUTE_PRIZES', false),
    ],
    'api_only' => env('DEMIAN_ARCADE_API_ONLY', false),
    // Disabled by default until production migration and award policy approval.
    'weekly_settlement_enabled' => (bool) env('DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED', false),
    'replay_retention_days' => 30,
    'completion_grace_seconds' => 300,
    // An absolute limit on bearer capabilities, not a refresh-token grant.
    'player_session_days' => 30,
    'recovery_link_minutes' => 20,
    // Manually saved, single-use long-term backup capability for anonymous accounts.
    'backup_code_days' => 180,
    'characters' => ['darya', 'setayesh', 'uzudi', 'negar', 'tiam', 'amirreza', 'hanna', 'ainaz', 'arsal', 'iman', 'amin', 'hossein'],
];
