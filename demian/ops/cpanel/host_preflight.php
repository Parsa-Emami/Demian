<?php

declare(strict_types=1);

/**
 * Offline, read-only production host contract for PHP 8.4 cPanel releases.
 *
 * Usage: php host_preflight.php /home/ACCOUNT/demian-api/shared/.env production https://api.example.com
 *
 * Never loads secrets into process environment, connects to the database,
 * mutates player data or logs any .env value. The deployer performs separate
 * database integrity and public HTTPS checks after this contract passes.
 */
function preflightFail(string $message): never
{
    fwrite(STDERR, "[cPanel Step 29] PRE-FLIGHT FAILED: {$message}\n");
    exit(1);
}

if ($argc !== 4) {
    preflightFail('Expected protected .env path, target and HTTPS API origin.');
}
[$script, $path, $target, $origin] = $argv;
if (!in_array($target, ['staging', 'production'], true)) {
    preflightFail('Environment target must be staging or production.');
}
if (!preg_match('~^https://[a-z0-9.-]+(?::[0-9]{2,5})?$~iD', $origin)
    || str_contains($origin, '..')) {
    preflightFail('Only a bare public HTTPS API origin is supported.');
}
if (!is_file($path) || is_link($path) || !is_readable($path)) {
    preflightFail('Protected shared .env is absent, unreadable or a symbolic link.');
}
$permissions = fileperms($path);
if ($permissions === false || ($permissions & 0077) !== 0) {
    preflightFail('The shared .env must have private owner-only permissions (0600 or 0400).');
}
if (filesize($path) === false || filesize($path) > 65536) {
    preflightFail('The environment file is oversized or inaccessible.');
}
if (PHP_VERSION_ID < 80400 || PHP_INT_SIZE !== 8) {
    preflightFail('The selected cPanel PHP CLI must be 64-bit PHP 8.4 or newer.');
}
foreach (['ctype', 'curl', 'dom', 'fileinfo', 'filter', 'hash', 'mbstring',
    'openssl', 'pcre', 'pdo', 'pdo_mysql', 'session', 'tokenizer', 'xml'] as $extension) {
    if (!extension_loaded($extension)) {
        preflightFail('The CLI PHP is missing an essential Laravel extension: '.$extension);
    }
}
$memory = (string) ini_get('memory_limit');
if ($memory !== '-1') {
    if (!preg_match('/^(\d+)([KMG]?)$/iD', $memory, $matches)) {
        preflightFail('Cannot interpret the PHP CLI memory limit.');
    }
    $bytes = (int) $matches[1] * match (strtoupper($matches[2])) {
        'G' => 1073741824, 'M' => 1048576, 'K' => 1024, default => 1,
    };
    if ($bytes < 268435456) {
        preflightFail('PHP CLI memory_limit must be at least 256 MiB.');
    }
}
$shared = dirname($path);
$storage = $shared.'/storage';
if (!is_dir($storage) || is_link($storage) || !is_writable($storage)) {
    preflightFail('Shared Laravel storage must be a writable, real directory.');
}
foreach (['framework/cache/data', 'framework/sessions', 'framework/views', 'logs'] as $subdirectory) {
    $directory = $storage.'/'.$subdirectory;
    if (!is_dir($directory) || !is_writable($directory)) {
        preflightFail('A persistent Laravel storage subdirectory is not writable: '.$subdirectory);
    }
}
$lines = file($path, FILE_IGNORE_NEW_LINES);
if (!is_array($lines)) preflightFail('Unable to inspect the protected .env.');
$values = [];
foreach ($lines as $line) {
    $line = trim($line);
    if ($line === '' || str_starts_with($line, '#')) continue;
    if (!preg_match('/^([A-Z][A-Z0-9_]*)=(.*)$/D', $line, $parts)) continue;
    $key = $parts[1];
    if (array_key_exists($key, $values)) {
        preflightFail('Duplicate environment key: '.$key);
    }
    $value = trim($parts[2]);
    if (strlen($value) >= 2 && (
        ($value[0] === '"' && substr($value, -1) === '"')
        || ($value[0] === "'" && substr($value, -1) === "'")
    )) {
        $value = substr($value, 1, -1);
    }
    $values[$key] = $value;
}
$require = static function (string $key, string $expected) use ($values): void {
    if (($values[$key] ?? null) !== $expected) {
        preflightFail('Unsafe or missing required environment setting: '.$key);
    }
};
foreach ([
    'APP_ENV' => $target,
    'APP_DEBUG' => 'false',
    'APP_URL' => $origin,
    'DEMIAN_ARCADE_API_ONLY' => 'true',
    'DB_CONNECTION' => 'mysql',
    'CACHE_STORE' => 'database',
    'QUEUE_CONNECTION' => 'database',
    'SESSION_DRIVER' => 'database',
    'SESSION_SECURE_COOKIE' => 'true',
] as $key => $expected) {
    $require($key, $expected);
}
$appKey = $values['APP_KEY'] ?? '';
if (!str_starts_with($appKey, 'base64:')) {
    preflightFail('Use an independently generated Laravel base64 APP_KEY.');
}
$keyBytes = base64_decode(substr($appKey, 7), true);
if ($keyBytes === false || strlen($keyBytes) !== 32
    || $keyBytes === str_repeat("\x00", 32)
    || count(array_unique(str_split($keyBytes))) < 8) {
    preflightFail('APP_KEY must decode to a nontrivial 32-byte cryptographic secret.');
}
foreach (['DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'] as $key) {
    $value = $values[$key] ?? '';
    if ($value === '' || $value === 'null' || $value === 'laravel'
        || ($key === 'DB_USERNAME' && strtolower($value) === 'root')) {
        preflightFail('A dedicated, non-default database credential is required: '.$key);
    }
}
$origins = explode(',', $values['DEMIAN_ARCADE_ALLOWED_ORIGINS'] ?? '');
if (count($origins) < 1 || count($origins) > 4) {
    preflightFail('One to four explicit client CORS origins are required.');
}
foreach ($origins as $allowed) {
    $allowed = trim($allowed);
    if (!preg_match('~^https://[a-z0-9.-]+(?::[0-9]{2,5})?$~iD', $allowed)
        || str_contains($allowed, '..')) {
        preflightFail('Only explicit HTTPS client origins may use the arcade API.');
    }
}
if (isset($values['SESSION_SAME_SITE'])
    && !in_array(strtolower($values['SESSION_SAME_SITE']), ['strict', 'lax'], true)) {
    preflightFail('Staff session cookies must not be cross-site.');
}
if (isset($values['LOG_LEVEL'])
    && !in_array($values['LOG_LEVEL'],
        ['warning', 'error', 'critical', 'alert', 'emergency'], true)) {
    preflightFail('A sensitive production API must not log at debug/verbose level.');
}
// Financial feature flags are separate human approvals, NOT deployment
// permissions. Refuse accidental production payouts on an unverified account.
$enabled = static fn (string $name): bool =>
    in_array(strtolower((string) ($values[$name] ?? 'false')), ['true', '1'], true);
$financial = [
    'DEMIAN_COUPONS_ISSUE_ENABLED', 'DEMIAN_COUPONS_AUTO_ISSUE_ENABLED',
    'DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED', 'DEMIAN_COUPONS_CAFE_ENABLED',
    'DEMIAN_COUPONS_CAMPAIGNS_ENABLED', 'DEMIAN_COUPONS_DELIVERY_SUPPORT_ENABLED',
    'DEMIAN_ARCADE_DRIFT_PRIZES_ENABLED', 'DEMIAN_ARCADE_CRITTERS_PRIZES_ENABLED',
    'DEMIAN_ARCADE_COFFEE_PRIZES_ENABLED', 'DEMIAN_ARCADE_AFTER_HOURS_PRIZES_ENABLED',
    'DEMIAN_ARCADE_CAFE_RUSH_PRIZES_ENABLED', 'DEMIAN_QUIET_HOURS_ENABLED',
    'DEMIAN_WEEKLY_AUTO_AWARDS_ENABLED',
];
// Staging is a strict non-financial rehearsal, never an alias for the real
// cashier or a production database. Financial UAT requires a separately
// authorized disposable sandbox, not these shared-host deployment flags.
if ($target === 'staging') {
    $database = strtolower((string) ($values['DB_DATABASE'] ?? ''));
    $apiHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    if (!str_contains($database, 'staging') || !str_contains($apiHost, 'staging')) {
        preflightFail('Staging must have an isolated staging-named database and HTTPS hostname.');
    }
    foreach ($origins as $allowed) {
        $clientHost = strtolower((string) parse_url(trim($allowed), PHP_URL_HOST));
        if (!str_contains($clientHost, 'staging')) {
            preflightFail('Staging must not authorize CORS for a production PWA origin.');
        }
    }
    $stagingForbidden = array_merge($financial, [
        'DEMIAN_AFTER_HOURS_ROUTE_PRIZES',
        'DEMIAN_CAFE_RUSH_ROUTE_PRIZES',
        'DEMIAN_OPEN_WORLD_ROUTE_PRIZES',
        'DEMIAN_WEEKLY_SETTLEMENT_ENABLED',
    ]);
    foreach ($stagingForbidden as $flag) {
        if ($enabled($flag)) {
            preflightFail('Staging financial flags must remain disabled: '.$flag);
        }
    }
}
if ($target === 'production') {
    $productionDb = strtolower((string) ($values['DB_DATABASE'] ?? ''));
    $productionHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    if (str_contains($productionDb, 'staging') || str_contains($productionHost, 'staging')) {
        preflightFail('Production cannot reuse the staging database or HTTPS hostname.');
    }
}
if ($target === 'production' && count(array_filter($financial, $enabled)) > 0) {
    foreach ([
        'DEMIAN_PRIZE_VERIFIED_PHONE_REQUIRED',
        'DEMIAN_PHONE_OTP_ENABLED', 'DEMIAN_COUPONS_POLICY_APPROVED',
        'DEMIAN_LEGAL_PUBLICATION_APPROVED',
        'DEMIAN_LEGAL_REQUIRE_ACCEPTANCE', 'DEMIAN_OPS_ENABLED',
    ] as $flag) {
        if (!$enabled($flag)) preflightFail('Financial rollout gate not approved: '.$flag);
    }
    $gatewayUrl = (string) ($values['DEMIAN_PHONE_OTP_GATEWAY_URL'] ?? '');
    $gateway = parse_url($gatewayUrl);
    if (!is_array($gateway) || ($gateway['scheme'] ?? '') !== 'https'
        || !filter_var($gateway['host'] ?? '', FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)
        || isset($gateway['user']) || isset($gateway['pass'])
        || isset($gateway['query']) || isset($gateway['fragment'])
        || strlen((string) ($values['DEMIAN_PHONE_OTP_GATEWAY_KEY'] ?? '')) < 24) {
        preflightFail('Verified prize rollout requires a secure configured SMS gateway.');
    }
    if ($enabled('DEMIAN_COUPONS_AUTO_ISSUE_ENABLED')
        || $enabled('DEMIAN_WEEKLY_AUTO_AWARDS_ENABLED')) {
        foreach (['DEMIAN_COUPONS_ISSUE_ENABLED', 'DEMIAN_WEEKLY_MANAGEMENT_ENABLED',
            'DEMIAN_WEEKLY_SETTLEMENT_ENABLED'] as $flag) {
            if (!$enabled($flag)) preflightFail('Automatic awards require manual approval: '.$flag);
        }
    }
}
if ($enabled('DEMIAN_WEB_PUSH_ENABLED')) {
    $subject = (string) ($values['DEMIAN_WEB_PUSH_SUBJECT'] ?? '');
    $validSubject = str_starts_with($subject, 'mailto:')
        ? filter_var(substr($subject, 7), FILTER_VALIDATE_EMAIL) !== false
        : str_starts_with($subject, 'https://') && filter_var($subject, FILTER_VALIDATE_URL) !== false;
    if (! $validSubject || ! preg_match('/^[A-Za-z0-9_-]{87}$/D', $values['DEMIAN_WEB_PUSH_PUBLIC_KEY'] ?? '')
        || ! preg_match('/^[A-Za-z0-9_-]{43}$/D', $values['DEMIAN_WEB_PUSH_PRIVATE_KEY'] ?? '')) {
        preflightFail('An enabled browser notification service requires a valid contact and both private environment keys.');
    }
}
$free = @disk_free_space($storage);
if ($free === false || $free < 536870912) {
    preflightFail('Less than 512 MiB of writable storage remains for logs and migrations.');
}
fwrite(STDOUT, "[cPanel Step 29] PASS: PHP runtime, private env, persistent storage, database and HTTPS contract.\n");
