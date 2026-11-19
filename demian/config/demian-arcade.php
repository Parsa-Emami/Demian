<?php

return [
    'require_contact' => (bool) env('DEMIAN_ARCADE_REQUIRE_CONTACT', true),
    'weekly_content_at' => env('DEMIAN_WEEKLY_CONTENT_AT'),
    'drift_prizes_enabled' => (bool) env('DEMIAN_ARCADE_DRIFT_PRIZES_ENABLED', false),
    'drift_ranked_enabled' => (bool) env('DEMIAN_ARCADE_DRIFT_RANKED_ENABLED', true),
    'rules_path' => resource_path('game/runner-rules.json'),
    // Reward-bearing Critters trials are opt-in only after end-to-end UAT.
    'critters_ranked_enabled' => (bool) env('DEMIAN_ARCADE_CRITTERS_RANKED_ENABLED', false),
    'coffee_ranked_enabled' => (bool) env('DEMIAN_ARCADE_COFFEE_RANKED_ENABLED', false),
    // Financial prize acceptance is independent from public verified rankings.
    'critters_prizes_enabled' => (bool) env('DEMIAN_ARCADE_CRITTERS_PRIZES_ENABLED', false),
    'coffee_prizes_enabled' => (bool) env('DEMIAN_ARCADE_COFFEE_PRIZES_ENABLED', false),
    // Original-game input-frame replay gates. OFF until differential UAT and
    // owner acceptance; route flags are mutually exclusive with gameplay mode.
    'gameplay_ranked_enabled' => [
        'after-hours' => (bool) env('DEMIAN_AFTER_HOURS_GAMEPLAY_RANKED', false),
        'cafe-rush' => (bool) env('DEMIAN_CAFE_RUSH_GAMEPLAY_RANKED', false),
    ],
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
    // Phase 2 Step 10. Collection and human review are opt-in at deployment;
    // no heuristic may automatically delete a score, ban a player or revoke
    // cash-equivalent vouchers. The operator has a separate password-protected
    // ability to place a bounded NEW-run-only hold after confirming a report.
    'anticheat' => [
        'enabled' => (bool) env('DEMIAN_ANTICHEAT_ENABLED', false),
        'observation_retention_days' => 30,
        // A reviewed/dismissed case's bounded evidence expires after one year;
        // unresolved cases are retained for human resolution.
        'closed_report_retention_days' => 365,
        'start_burst_count' => 10,
        'start_burst_minutes' => 10,
        'rejection_burst_count' => 4,
        'rejection_burst_minutes' => 15,
        'ip_cohort_accounts' => 12,
        'ip_cohort_minutes' => 30,
        'replay_clone_days' => 7,
        'score_outlier_min_history' => 20,
        'score_outlier_ratio' => 4,
    ],
    'api_only' => env('DEMIAN_ARCADE_API_ONLY', false),
    // Disabled by default until production migration and award policy approval.
    'weekly_settlement_enabled' => (bool) env('DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED', false),
    'replay_retention_days' => 30,
    'completion_grace_seconds' => 300,
    // Phase 3 Step 11: stored per-period upon creation; changing env affects
    // only FUTURE weeks, never an already prepared/in-progress season.
    'weekly_start_cutoff_seconds' => (int) env('DEMIAN_WEEKLY_START_CUTOFF_SECONDS', 30),
    'weekly_completion_deadline_seconds' => (int) env('DEMIAN_WEEKLY_COMPLETION_DEADLINE_SECONDS', 900),
    'weekly_management_enabled' => (bool) env('DEMIAN_WEEKLY_MANAGEMENT_ENABLED', false),
    'weekly_auto_awards_enabled' => (bool) env('DEMIAN_WEEKLY_AUTO_AWARDS_ENABLED', false),
    'weekly_auto_award_from' => env('DEMIAN_WEEKLY_AUTO_AWARD_FROM', ''),
    // An absolute limit on bearer capabilities, not a refresh-token grant.
    'player_session_days' => 30,
    'recovery_link_minutes' => 20,
    // Manually saved, single-use long-term backup capability for anonymous accounts.
    'backup_code_days' => 180,
    'characters' => ['darya', 'setayesh', 'uzudi', 'negar', 'tiam', 'amirreza', 'hanna', 'ainaz', 'arsal', 'iman', 'amin', 'hossein', 'taher-db', 'sorkhi', 'yalda', 'mori', 'mahyar'],
];
