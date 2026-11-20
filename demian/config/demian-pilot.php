<?php

return [
    'live_enabled'=>filter_var(env('DEMIAN_PILOT_LIVE_ENABLED',false),FILTER_VALIDATE_BOOL),
    'release_sha'=>env('DEMIAN_PILOT_RELEASE_SHA',''),
    'art_manifest_sha256'=>env('DEMIAN_PILOT_ART_MANIFEST_SHA256',''),
];
