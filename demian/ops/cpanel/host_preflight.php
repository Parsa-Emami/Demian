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
fwrite(STDOUT, "[cPanel Step 29] PASS: PHP runtime, private env, persistent storage, database and HTTPS contract.\n");
