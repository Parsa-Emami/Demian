<?php

return [
    'enabled'=>filter_var(env('DEMIAN_QUIET_HOURS_ENABLED',false),FILTER_VALIDATE_BOOL),
    'daily_budget_minor'=>env('DEMIAN_QUIET_HOURS_DAILY_BUDGET_MINOR',''),
    'max_percent'=>10,
    'occupancy_threshold_percent'=>40,
    'cost_ceiling_bps'=>env('DEMIAN_QUIET_HOURS_COST_CEILING_BPS',''),
    'margin_floor_bps'=>env('DEMIAN_QUIET_HOURS_MARGIN_FLOOR_BPS',''),
];
