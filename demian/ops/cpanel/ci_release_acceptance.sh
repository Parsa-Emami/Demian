#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true ]]
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
[[ -n "${RUNNER_TEMP:-}" && -d "$RUNNER_TEMP" ]]
archive="$RUNNER_TEMP/demian-cpanel.tar.gz"
[[ -s "$archive" && -s "$RUNNER_TEMP/demian-cpanel.sha256" ]] || {
    echo "No packaged archive or SHA-256 sidecar" >&2; exit 1
}
expected="$(cat "$RUNNER_TEMP/demian-cpanel.sha256")"
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 1
actual="$(sha256sum "$archive" | cut -d' ' -f1)"
[[ "$actual" == "$expected" ]] || {
    echo "Artifact SHA-256 differs from packaging receipt" >&2; exit 1
}
php -r '
    $receipt = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
    exit(
        ($receipt["schema"] ?? 0) === 1
        && ($receipt["kind"] ?? "") === "demian-cpanel-api-only"
        && ($receipt["commit"] ?? "") === $argv[2]
        && hash_equals((string) ($receipt["archiveSha256"] ?? ""), $argv[3])
        && ($receipt["productionAuthorized"] ?? null) === false
        && ($receipt["hostDeployed"] ?? null) === false
        && ($receipt["financialFlagsActivated"] ?? null) === false
        ? 0 : 1
    );
' "$RUNNER_TEMP/demian-cpanel.manifest.json" "$GITHUB_SHA" "$actual" || {
    echo "Release manifest identity or no-go contract failed" >&2; exit 1
}
lab="$(mktemp -d "$RUNNER_TEMP/demian-release.XXXXXX")"
pid=''
cleanup() {
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
    rm -rf -- "$lab"
}
trap cleanup EXIT
mkdir -p "$lab/release" "$lab/shared/storage/framework/cache/data" \
    "$lab/shared/storage/framework/sessions" "$lab/shared/storage/framework/views" "$lab/shared/storage/logs"
tar -tzf "$archive" > "$lab/entries"
tar -tvzf "$archive" > "$lab/types"
for required in ops/cpanel/cron.sh ops/cpanel/rollback.sh \
    ops/cpanel/restore_drill.sh ops/cpanel/install_webroot_bridge.php; do
    grep -Fx "$required" "$lab/entries" >/dev/null || {
        echo "Incomplete deploy/rollback/restore contract in archive" >&2; exit 1
    }
done
if grep -Eq '(^/|(^|/)[.][.](/|$)|(^|/)([.]env|[.]git|[.]ssh)(/|$)|^bootstrap/cache/.*[.]php$)' "$lab/entries" || grep -Eq '^[^d-]' "$lab/types"; then
    echo 'Unsafe or environment-specific archive entry' >&2
    exit 1
fi
tar -xzf "$archive" --no-same-owner -C "$lab/release"
test -f "$lab/release/vendor/autoload.php"
test ! -d "$lab/release/vendor/phpunit"
key="$(php -r 'echo "base64:".base64_encode(random_bytes(32));')"
cat > "$lab/shared/.env" <<EOF
APP_ENV=staging
APP_DEBUG=false
APP_URL=https://api.example.test
APP_KEY=$key
LOG_LEVEL=warning
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=demian_release_ci
DB_USERNAME=demian_ci
DB_PASSWORD=disposable-ci-only
CACHE_STORE=database
QUEUE_CONNECTION=database
SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
DEMIAN_ARCADE_API_ONLY=true
DEMIAN_ARCADE_ALLOWED_ORIGINS=https://game.example.test
DEMIAN_COUPONS_POLICY_APPROVED=false
DEMIAN_COUPONS_ISSUE_ENABLED=false
DEMIAN_COUPONS_AUTO_ISSUE_ENABLED=false
DEMIAN_COUPONS_CAFE_ENABLED=false
DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED=false
DEMIAN_ARCADE_WEEKLY_SETTLEMENT_ENABLED=false
DEMIAN_WEEKLY_AUTO_AWARDS_ENABLED=false
EOF
chmod 600 "$lab/shared/.env"
cd "$lab/release"
php ops/cpanel/host_preflight.php "$lab/shared/.env" staging https://api.example.test
ln -s "$lab/shared/.env" .env
ln -s "$lab/shared/storage" storage
printf '%s\n' "$GITHUB_SHA" > .mobile11-release
php artisan optimize
php artisan migrate --force --no-interaction
php artisan migrate --force --no-interaction
php artisan arcade:integrity --json
php artisan arcade:audit-coupons --json
php artisan schedule:list
(cd public && exec php -S 127.0.0.1:8099 -t . ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php) > "$lab/http.log" 2>&1 &
pid=$!
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
const origin = 'http://127.0.0.1:8099';
const api = '/api/v1/arcade';
async function request(path, options = {}) {
    return fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(5000),
        ...options, headers: { Accept: 'application/json', ...options.headers } });
}
let health;
for (let i = 0; i < 40; i++) {
    try { health = await request(api + '/health'); if (health.status === 200) break; } catch {}
    await delay(250);
}
assert.equal(health?.status, 200, 'packaged API readiness');
assert.deepEqual(await health.json(), { status: 'ok', release: process.env.GITHUB_SHA });
assert.match(health.headers.get('cache-control') ?? '', /no-store/);
const checks = [];
async function check(path, status, options) {
    const response = await request(path, options);
    assert.equal(response.status, status, path);
    checks.push({ path, status });
    return response;
}
assert.equal((await (await check(api + '/games', 200)).json()).games.length, 7);
assert.equal((await (await check(api + '/rules', 200)).json()).game_id, 'dino-run');
assert.ok(Array.isArray((await (await check(api + '/leaderboards/dino-run?period=weekly', 200)).json()).data));
await check(api + '/legal', 200);
await check(api + '/player', 401);
await check(api + '/player/coupons', 401);
await check('/cashier/login', 503);
for (const path of ['/', '/characters', '/.env', '/composer.json', '/vendor/autoload.php']) {
    await check(path, 404);
}
// The built-in server may deny a storage symlink before Laravel routing.
// Both denial statuses are safe; redirects and successful reads are not.
const privateLog = await request('/storage/logs/laravel.log');
assert.ok([403, 404].includes(privateLog.status), 'private log must not be served');
checks.push({ path: '/storage/logs/laravel.log', status: privateLog.status });
const options = origin => ({ method: 'OPTIONS', headers: { Origin: origin,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
const allowed = await request(api + '/runs', options('https://game.example.test'));
assert.ok([200, 204].includes(allowed.status));
assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://game.example.test');
const blocked = await request(api + '/runs', options('https://untrusted.example.test'));
// Some CORS implementations emit the single configured allowed origin
// even on a mismatched request. The browser still rejects it: neither
// wildcard nor the requesting untrusted origin may be returned.
const deniedOrigin = blocked.headers.get('access-control-allow-origin');
assert.ok(deniedOrigin === null || deniedOrigin === 'https://game.example.test',
    'untrusted origin must not receive a matching or wildcard CORS grant');
writeFileSync(process.env.RUNNER_TEMP + '/phase1-api-evidence.json', JSON.stringify({
    schema: 1, status: 'passed', commit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
    php: '8.4', database: 'disposable MySQL 8.4', productionDependencies: true,
    preflight: true, migrationsRepeatable: true, rankingIntegrity: true, couponAudit: true,
    cors: true, exactReleaseHealth: true, checks,
    hostDeployed: false, productionCapacityCertified: false, realDeviceVerified: false
}, null, 2) + '\n');
JS
echo "PR06 archive release test passed for exact SHA $GITHUB_SHA; no real host deployed"
