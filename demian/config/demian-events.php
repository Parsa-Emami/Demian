<?php

return [
    'active' => env('DEMIAN_ACTIVE_EVENT', 'cafe-rush'),
    'completion_grace_seconds' => (int) env('DEMIAN_EVENT_GRACE_SECONDS', 30),
];
