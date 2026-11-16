<?php

return [
    // OFF until the real API host has private storage, Cron and alert routing.
    'enabled' => filter_var(env('DEMIAN_OPS_ENABLED', false), FILTER_VALIDATE_BOOL),
    'client_telemetry_enabled' => filter_var(env('DEMIAN_OPS_CLIENT_TELEMETRY', false), FILTER_VALIDATE_BOOL),
    'sample_rate' => min(1.0, max(0.0, (float) env('DEMIAN_OPS_SUCCESS_SAMPLE_RATE', 0.2))),
    'slow_request_ms' => max(100, min(30000, (int) env('DEMIAN_OPS_SLOW_REQUEST_MS', 1500))),
    'http_p95_budget_ms' => max(100, min(30000, (int) env('DEMIAN_OPS_HTTP_P95_MS', 1000))),
    'game_load_budget_ms' => max(500, min(60000, (int) env('DEMIAN_OPS_GAME_LOAD_P95_MS', 7000))),
    'error_rate_budget' => min(1.0, max(0.001, (float) env('DEMIAN_OPS_ERROR_RATE', 0.01))),
    'minimum_http_samples' => max(10, min(1000, (int) env('DEMIAN_OPS_MIN_HTTP_SAMPLES', 20))),
    'disk_min_free_bytes' => 512 * 1024 * 1024,
    'heartbeat_max_age_seconds' => 600,
    'alert_cooldown_seconds' => 1800,
    'alert_email' => env('DEMIAN_OPS_ALERT_EMAIL', ''),
    'window_minutes' => 15,
    'max_log_bytes_per_day' => 2 * 1024 * 1024,
    'max_log_records' => 5000,
    'log_directory' => storage_path('logs'),
];
