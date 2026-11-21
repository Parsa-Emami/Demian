<?php
declare(strict_types=1);

$script = dirname(__DIR__, 2).'/ops/cpanel/install_webroot_bridge.php';
$home = sys_get_temp_dir().'/demian-phase10-bridge-'.bin2hex(random_bytes(6));
$root = $home.'/demian-api';
$web = $home.'/public_html/api';
foreach ([$root.'/releases', $root.'/shared', $web.'/.well-known/acme-challenge'] as $dir) {
    mkdir($dir, 0700, true);
}
file_put_contents($root.'/shared/.env', "APP_ENV=staging\nAPP_KEY=fixture-private\n");
file_put_contents($web.'/.well-known/acme-challenge/token', 'cert-challenge');

$call = static function (string $webroot, string $ack) use ($home, $root, $script): array {
    $cmd = implode(' ', array_map('escapeshellarg',
        [PHP_BINARY, $script, $root, $webroot, $ack]));
    $process = proc_open($cmd, [1 => ['pipe','w'], 2 => ['pipe','w']],
        $pipes, null, ['HOME' => $home, 'PATH' => (string) getenv('PATH')]);
    if (!is_resource($process)) throw new RuntimeException('Bridge test cannot start PHP.');
    $stdout=stream_get_contents($pipes[1]);
    $stderr=stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    return [proc_close($process), $stdout.$stderr];
};
$cases=0;
$check = static function (bool $ok, string $name) use (&$cases): void {
    $cases++;
    if (!$ok) throw new RuntimeException('cPanel bridge: '.$name);
};
try {
    [$status, $message] = $call($web, 'WRONG_ACK');
    $check($status !== 0, 'must require explicit API subdomain confirmation');
    $check(!is_file($web.'/index.php'), 'must not create files on failed acknowledgment');

    [$status, $message] = $call($web, 'DEMIAN_API_SUBDOMAIN_ONLY');
    $check($status === 0, 'owner-approved empty subdomain installs');
    $index = file_get_contents($web.'/index.php');
    $rules = file_get_contents($web.'/.htaccess');
    $check(str_contains($index, $root.'/current')
        && str_contains($index, 'handleRequest')
        && str_contains($index, "DEMIAN_CPANEL_BRIDGE_V1"), 'bridge loads only current release');
    $check(!str_contains($index, 'APP_KEY=fixture-private'), 'no .env secrets in webroot');
    $check(str_contains($rules, 'Require all denied')
        && str_contains($rules, 'RewriteEngine On')
        && str_contains($rules, 'HTTP_AUTHORIZATION'), 'Apache protects non-index files');
    $check(file_get_contents($web.'/.well-known/acme-challenge/token') === 'cert-challenge',
        'AutoSSL files survive installation');
    [$status] = $call($web, 'DEMIAN_API_SUBDOMAIN_ONLY');
    $check($status === 0 && file_get_contents($web.'/index.php') === $index,
        'owned bridge installation is idempotent');

    file_put_contents($web.'/unrelated-website.txt', 'owner content');
    [$status] = $call($web, 'DEMIAN_API_SUBDOMAIN_ONLY');
    $check($status !== 0 && file_get_contents($web.'/unrelated-website.txt') === 'owner content',
        'never overwrite existing websites');
    unlink($web.'/unrelated-website.txt');

    $mainWeb = $home.'/public_html';
    [$status] = $call($mainWeb, 'DEMIAN_API_SUBDOMAIN_ONLY');
    $check($status !== 0, 'main public_html is never an API subdomain');
    $evil = $home.'/public_html/api-redirect';
    symlink($root, $evil);
    [$status] = $call($evil, 'DEMIAN_API_SUBDOMAIN_ONLY');
    $check($status !== 0, 'symlinked webroot must fail');
    echo '[Phase 10] '.$cases." cPanel fixed-webroot bridge tests passed, no host touched.\n";
} finally {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($home, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iterator as $entry) {
        if ($entry->isLink() || !$entry->isDir()) unlink($entry->getPathname());
        else rmdir($entry->getPathname());
    }
    rmdir($home);
}
