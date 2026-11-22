<?php

declare(strict_types=1);

/**
 * cPanel fallback for providers that restrict the domain DocumentRoot to an
 * ordinary (non-symlink) folder under public_html. Generates only a minimal
 * front controller plus Apache rules, never copies Laravel source/vendor/env.
 *
 * php install_webroot_bridge.php ROOT API_WEBROOT DEMIAN_API_SUBDOMAIN_ONLY
 * The owner must FIRST create a dedicated API subdomain pointing at API_WEBROOT.
 */
function refuse(string $message): never
{
    fwrite(STDERR, '[Demian bridge] '.$message.PHP_EOL);
    exit(1);
}

if ($argc !== 4 || $argv[3] !== 'DEMIAN_API_SUBDOMAIN_ONLY') {
    refuse('Explicit API-only subdomain confirmation required.');
}
$home = realpath((string) getenv('HOME'));
$root = realpath($argv[1]);
$web = realpath($argv[2]);
if (!$home || !$root || !$web || !is_dir($root.'/releases')
    || !is_dir($root.'/shared') || is_link($argv[2])
    || !str_starts_with($root.'/', $home.'/')
    || !str_starts_with($web.'/', $home.'/')
    || str_starts_with($web.'/', $root.'/')
    || str_starts_with($root.'/', $web.'/')
    || !str_starts_with(basename($web), 'api')
    || !is_writable($web) || !is_writable($root.'/shared')) {
    refuse('Unsafe root, symlinked webroot or non-dedicated API document root.');
}
if (!is_file($root.'/shared/.env')) {
    refuse('Protected shared .env must be configured before installing bridge.');
}
foreach (new DirectoryIterator($web) as $entry) {
    $name = $entry->getFilename();
    if ($entry->isDot()) continue;
    if ($name === '.well-known' && $entry->isDir() && !$entry->isLink()) continue;
    $path = $entry->getPathname();
    if ($entry->isLink()) refuse('Unexpected symlink in API document root.');
    if (($name === 'index.php' && is_file($path)
            && str_starts_with((string) file_get_contents($path), "<?php\n// DEMIAN_CPANEL_BRIDGE_V1\n"))
        || ($name === '.htaccess' && is_file($path)
            && str_starts_with((string) file_get_contents($path), '# DEMIAN_CPANEL_BRIDGE_V1'))) {
        continue;
    }
    refuse('API webroot contains existing content; refusing to overwrite it.');
}

$index = <<<'FRONT'
<?php
// DEMIAN_CPANEL_BRIDGE_V1
declare(strict_types=1);
$base = __DEMIAN_PRIVATE_ROOT__;
$active = $base.'/current';
$real = is_link($active) ? realpath($active) : false;
// Fail closed rather than serving sources from an unexpected location.
if (!$real || !str_starts_with($real.'/', $base.'/releases/')
    || !is_file($real.'/vendor/autoload.php')
    || !is_file($real.'/bootstrap/app.php')) {
    http_response_code(503);
    header('Cache-Control: no-store');
    exit;
}
if (file_exists($maintenance = $real.'/storage/framework/maintenance.php')) {
    require $maintenance;
}
require $real.'/vendor/autoload.php';
$app = require $real.'/bootstrap/app.php';
$app->handleRequest(Illuminate\Http\Request::capture());
FRONT;
$index = str_replace('__DEMIAN_PRIVATE_ROOT__', var_export($root, true), $index);
$rules = <<<'APACHE'
# DEMIAN_CPANEL_BRIDGE_V1
# Fixed dedicated API webroot. Never put .env, vendor or Laravel source here.
<IfModule mod_negotiation.c>
    Options -MultiViews -Indexes
</IfModule>
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
    RewriteCond %{HTTP:x-xsrf-token} .
    RewriteRule .* - [E=HTTP_X_XSRF_TOKEN:%{HTTP:X-XSRF-Token}]
    RewriteRule ^\.well-known/ - [L]
    RewriteRule (^|/)\.(?!well-known(?:/|$)) - [F,L]
    RewriteRule ^(vendor|storage|bootstrap|database|config|routes|artisan)(/|$) - [F,L,NC]
    RewriteRule ^(composer\.(json|lock)|\.env)$ - [F,L,NC]
    RewriteRule ^index\.php$ - [L]
    RewriteCond %{REQUEST_FILENAME} -f
    RewriteRule ^ - [F,L]
    RewriteRule ^ index.php [L]
</IfModule>
<IfModule mod_authz_core.c>
    <FilesMatch "^(?!index\.php$).+\.php$">
        Require all denied
    </FilesMatch>
</IfModule>
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
APACHE;

foreach (['.htaccess' => $rules."\n", 'index.php' => $index."\n"] as $name => $content) {
    $tmp = $root.'/shared/.bridge-'.bin2hex(random_bytes(8));
    try {
        if (file_put_contents($tmp, $content, LOCK_EX) === false) {
            refuse('Cannot prepare protected bridge file.');
        }
        chmod($tmp, 0644);
        if (!rename($tmp, $web.'/'.$name)) {
            refuse('Cannot publish bridge file to dedicated API root.');
        }
    } finally {
        if (is_file($tmp)) unlink($tmp);
    }
}
fwrite(STDOUT, '[Demian bridge] Dedicated API front controller installed. Verify Web PHP 8.4 and HTTPS.' . PHP_EOL);
