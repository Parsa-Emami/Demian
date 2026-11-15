<?php

declare(strict_types=1);

// Standalone contract regression: no external DB, network or production host.
// Invoked by the PHP 8.4 cPanel-runtime CI job.
$checker = dirname(__DIR__, 2).'/ops/cpanel/host_preflight.php';
$home = sys_get_temp_dir().'/demian-step29-'.bin2hex(random_bytes(8));
$shared = $home.'/shared';
@mkdir($shared.'/storage/framework/cache/data', 0700, true);
@mkdir($shared.'/storage/framework/sessions', 0700, true);
@mkdir($shared.'/storage/framework/views', 0700, true);
@mkdir($shared.'/storage/logs', 0700, true);

$key = base64_encode(hash('sha256', 'step-29-fixture-not-for-real-deploy', true));
$valid = [
    'APP_NAME' => 'DemianQA',
    'APP_ENV' => 'staging',
    'APP_DEBUG' => 'false',
    'APP_KEY' => 'base64:'.$key,
    'APP_URL' => 'https://staging.example.test',
    'DEMIAN_ARCADE_API_ONLY' => 'true',
    'DEMIAN_ARCADE_ALLOWED_ORIGINS' => 'https://game.example.test',
    'DB_CONNECTION' => 'mysql',
    'DB_HOST' => 'localhost',
    'DB_DATABASE' => 'qa_demian',
    'DB_USERNAME' => 'qa_player',
    'DB_PASSWORD' => 'fake-standalone-ci-password',
    'CACHE_STORE' => 'database',
    'QUEUE_CONNECTION' => 'database',
    'SESSION_DRIVER' => 'database',
    'SESSION_SECURE_COOKIE' => 'true',
    'SESSION_SAME_SITE' => 'lax',
    'LOG_LEVEL' => 'warning',
];
$attempts = 0;
$write = static function (array $data, string $additional = '') use ($shared): string {
    $path = $shared.'/.env';
    file_put_contents($path, implode("\n", array_map(
        static fn (string $key, string $value): string => $key.'='.$value,
        array_keys($data), array_values($data)
    ))."\n".$additional);
    chmod($path, 0600);
    return $path;
};
$invoke = static function (array $data, bool $shouldPass, string $name, string $additional = '')
    use (&$attempts, $write, $checker): void {
    $attempts++;
    $path = $write($data, $additional);
    $command = implode(' ', array_map('escapeshellarg', [
        PHP_BINARY, $checker, $path, $data['APP_ENV'] ?? 'staging', $data['APP_URL'] ?? '',
    ]));
    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open($command, $descriptors, $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Unable to spawn preflight contract test: '.$name);
    }
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    $result = proc_close($process);
    if (($result === 0) !== $shouldPass) {
        throw new RuntimeException($name.' returned '.$result.
            ' (expected '.($shouldPass ? 'success' : 'failure').'): '.$stdout.$stderr);
    }
    if (($data['DB_PASSWORD'] ?? '') !== ''
        && str_contains($stdout.$stderr, $data['DB_PASSWORD'])
        || str_contains($stdout.$stderr, $data['APP_KEY'] ?? 'impossible')) {
        throw new RuntimeException('Preflight leaked a protected credential: '.$name);
    }
};
$change = static fn (string $key, string $value): array => array_replace($valid, [$key => $value]);
try {
    $invoke($valid, true, 'valid staging');

    $production = array_replace($valid, [
        'APP_ENV' => 'production', 'APP_URL' => 'https://api.example.test',
    ]);
    $invoke($production, true, 'valid production');

    foreach ([
        ['APP_DEBUG', 'true'],
        ['APP_KEY', 'base64:'.base64_encode(str_repeat("\x00", 32))],
        ['APP_KEY', 'a-non-base64-production-secret'],
        ['APP_URL', 'http://staging.example.test'],
        ['DEMIAN_ARCADE_API_ONLY', 'false'],
        ['DEMIAN_ARCADE_ALLOWED_ORIGINS', '*'],
        ['DEMIAN_ARCADE_ALLOWED_ORIGINS', 'http://game.example.test'],
        ['CACHE_STORE', 'array'],
        ['QUEUE_CONNECTION', 'sync'],
        ['SESSION_DRIVER', 'file'],
        ['SESSION_SECURE_COOKIE', 'false'],
        ['SESSION_SAME_SITE', 'none'],
        ['DB_CONNECTION', 'sqlite'],
        ['DB_USERNAME', 'root'],
        ['DB_PASSWORD', ''],
        ['LOG_LEVEL', 'debug'],
    ] as [$key, $value]) {
        $invoke($change($key, $value), false, 'invalid '.$key);
    }
    $invoke($valid, false, 'duplicate setting', "APP_DEBUG=true\n");
    $write($valid);
    chmod($shared.'/.env', 0644);
    $process = proc_open(implode(' ', array_map('escapeshellarg',
        [PHP_BINARY, $checker, $shared.'/.env', 'staging', 'https://staging.example.test']
    )), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    if (proc_close($process) === 0 || !str_contains($stderr, 'owner-only')) {
        throw new RuntimeException('World-readable shared .env unexpectedly passed: '.$stdout.$stderr);
    }
    $attempts++;

    echo '[Step 29] '.$attempts.' cPanel host-contract checks passed (no real host accessed).'.PHP_EOL;
} finally {
    // Small disposable, local test tree; never touches account-owned files.
    foreach (new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($home, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    ) as $entry) {
        $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
    }
    rmdir($home);
}
