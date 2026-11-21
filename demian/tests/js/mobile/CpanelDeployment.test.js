import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readlinkSync, existsSync, symlinkSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = new URL('../../../ops/cpanel/deploy.sh', import.meta.url);
const sha = 'a'.repeat(40);
const oldSha = 'b'.repeat(40);
const origin = 'https://api.example.invalid';
const php = `#!/usr/bin/env bash
set -eu
if [[ "$1" == -r ]]; then exec php "$@"; fi
if [[ "$1" == */host_preflight.php ]]; then
    echo preflight >> "$TRACE"
    [[ "$SCENARIO" != preflight ]]
    exit
fi
[[ "$1" == artisan ]]
echo "$2" >> "$TRACE"
if [[ "$2" == route:list ]]; then
    if [[ "$SCENARIO" == missing_route ]]; then echo '[]'; else echo '[{"uri":"api/v1/arcade/health"}]'; fi
fi
if [[ "$2" == migrate && "$SCENARIO" == migration ]]; then exit 1; fi
`;
const curl = `#!/usr/bin/env bash
set -eu
case "\${!#}" in
    */health)
        if [[ "$SCENARIO" == health ]]; then echo '{"status":"degraded"}';
        else printf '{"status":"ok","release":"%s"}' "$SHA"; fi ;;
    */characters) printf 404 ;;
    */cashier/login) printf 503 ;;
    */leaderboards/*) : ;;
    *) exit 1 ;;
esac
`;

function run(scenario) {
    const home = mkdtempSync(join(tmpdir(), 'demian-cpanel-'));
    try {
        const root = join(home, 'api'), pkg = join(home, 'package'), bin = join(home, 'bin');
        const previous = join(root, 'releases', oldSha), current = join(root, 'current');
        const release = join(root, 'releases', sha), trace = join(home, 'trace');
        for (const dir of [previous, join(root, 'shared'), join(root, 'incoming'), bin, pkg]) mkdirSync(dir, { recursive: true });
        if (scenario === 'invalid_current') mkdirSync(current);
        else if (scenario === 'outside_current') symlinkSync(home, current);
        else if (scenario !== 'first' && scenario !== 'first_failure') symlinkSync(previous, current);
        writeFileSync(join(root, 'shared', '.env'), `APP_ENV=staging\nAPP_DEBUG=false\nAPP_URL=${origin}\nAPP_KEY=base64:${'A'.repeat(44)}\nDEMIAN_ARCADE_API_ONLY=true\nDB_CONNECTION=mysql\n`, { mode: 0o600 });
        writeFileSync(trace, '');
        for (const file of ['artisan', 'vendor/autoload.php', 'public/index.php', 'public/.htaccess', 'ops/cpanel/host_preflight.php', 'ops/cpanel/cron.sh', 'ops/cpanel/rollback.sh',
            'ops/cpanel/install_webroot_bridge.php']) {
            const path = join(pkg, file);
            mkdirSync(join(path, '..'), { recursive: true });
            writeFileSync(path, 'fixture\n');
        }
        if (scenario === 'archive_hardlink') linkSync(join(pkg, 'artisan'), join(pkg, 'hardlink'));
        if (scenario === 'archive_symlink') symlinkSync('artisan', join(pkg, 'symlink'));
        if (scenario === 'archive_fifo') assert.equal(spawnSync('mkfifo', [join(pkg, 'fifo')]).status, 0);
        if (scenario === 'release_symlink') {
            const other = join(home, 'outside-release');
            mkdirSync(other);
            writeFileSync(join(other, '.mobile11-release'), sha);
            symlinkSync(other, release);
        }
        const archive = join(root, 'incoming', `${sha}.tar.gz`);
        assert.equal(spawnSync('tar', ['-czf', archive, '-C', pkg, '.']).status, 0);
        writeFileSync(join(bin, 'mock-php'), php, { mode: 0o755 });
        writeFileSync(join(bin, 'curl'), curl, { mode: 0o755 });
        const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
        const extra = scenario === 'archive_bad_digest' ? ['0'.repeat(64)]
            : scenario === 'archive_good_digest' ? [digest] : [];
        const result = spawnSync('bash', [source.pathname, sha, root, origin, 'staging', join(bin, 'mock-php'), '-', ...extra], {
            env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, TRACE: trace, SHA: sha,
                SCENARIO: scenario === 'first_failure' ? 'health' : scenario }, encoding: 'utf8', timeout: 15000,
        });
        assert.ifError(result.error);
        return { status: result.status, diagnostic: result.stderr, trace: readFileSync(trace, 'utf8'),
            current: scenario === 'invalid_current' ? 'directory' : existsSync(current) ? readlinkSync(current) === release ? 'new' : readlinkSync(current) === previous ? 'previous' : 'outside' : 'absent',
            archive: existsSync(archive), release: existsSync(release) };
    } finally { rmSync(home, { recursive: true, force: true }); }
}

for (const scenario of ['invalid_current', 'outside_current', 'release_symlink', 'archive_hardlink', 'archive_fifo', 'archive_symlink']) {
    test(`cPanel rejects ${scenario} before Laravel execution`, () => {
        const r = run(scenario);
        assert.notEqual(r.status, 0, r.diagnostic);
        assert.equal(r.trace, '');
        assert.equal(r.archive, true);
    });
}
test('cPanel preflight failure never boots Laravel', () => {
    const r = run('preflight');
    assert.notEqual(r.status, 0);
    assert.equal(r.trace, 'preflight\n');
    assert.equal(r.current, 'previous');
});
test('cPanel refuses missing health route before migration', () => {
    const r = run('missing_route');
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.trace, /migrate/);
    assert.equal(r.current, 'previous');
});
test('cPanel migration failure does not switch code', () => {
    const r = run('migration');
    assert.notEqual(r.status, 0);
    assert.equal(r.current, 'previous');
    assert.equal(r.archive, true);
});
test('cPanel unhealthy release restores actual previous symlink', () => {
    const r = run('health');
    assert.notEqual(r.status, 0);
    assert.equal(r.current, 'previous');
    assert.equal(r.archive, true);
});
test('cPanel unhealthy first release removes current symlink', () => {
    const r = run('first_failure');
    assert.notEqual(r.status, 0);
    assert.equal(r.current, 'absent');
    assert.equal(r.archive, true);
});
for (const scenario of ['healthy', 'first']) {
    test(`cPanel ${scenario} deployment makes new release current`, () => {
        const r = run(scenario);
        assert.equal(r.status, 0, r.diagnostic);
        assert.equal(r.current, 'new');
        assert.equal(r.archive, false);
        assert.match(r.trace, /^preflight\noptimize\nroute:list\npreflight\nmigrate\n/);
    });
}

test('cPanel rejects tampered archive digest before invoking Laravel preflight', () => {
    const r=run('archive_bad_digest');
    assert.notEqual(r.status,0);
    assert.equal(r.trace,'');
    assert.equal(r.archive,true);
});
test('cPanel accepts matching content digest for the exact archived bytes', () => {
    const r=run('archive_good_digest');
    assert.equal(r.status,0,r.diagnostic);
    assert.equal(r.current,'new');
    assert.equal(r.archive,false);
});
