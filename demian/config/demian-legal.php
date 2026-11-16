<?php

declare(strict_types=1);

// Source of truth shared by the backend and static web application.
$policy = json_decode(file_get_contents(resource_path('legal/policy.json')),
    true, flags: JSON_THROW_ON_ERROR);

return [
    ...$policy,
    'publication_approved' => filter_var(env('DEMIAN_LEGAL_PUBLICATION_APPROVED', false), FILTER_VALIDATE_BOOL),
    'require_acceptance' => filter_var(env('DEMIAN_LEGAL_REQUIRE_ACCEPTANCE', false), FILTER_VALIDATE_BOOL),
];
