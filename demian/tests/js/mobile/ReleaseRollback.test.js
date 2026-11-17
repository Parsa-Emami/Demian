import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const targets = {
    cpanel: ['../../../ops/cpanel/deploy.sh', 'switch_to "$release"'],
    server: ['../../../ops/mobile-11/release.sh', 'activate "$release"'],
};
const harness = String.raw`
set -Eeuo pipefail
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
origin=https://example.invalid
url=$origin
php_bin=php
release=$PWD
rollback() { printf 'rollback\n'; }
switch_to() { printf 'activate\n'; }
activate() { switch_to "$@"; }
php() {
    if [[ "${'$'}{1:-}" == artisan ]]; then
        [[ "$CASE" != reload ]]
    else
        command php "$@"
    fi
}
curl() {
    local endpoint="${'$'}{!#}" path
    path="${'$'}{endpoint#"$origin"}"
    case "$path" in
        /api/v1/arcade/health)
            case "$CASE" in
                health_network) return 7 ;;
                health_invalid_json) printf 'not-json' ;;
                health_degraded) printf '{"status":"degraded","release":"%s"}' "$sha" ;;
                health_wrong_sha) printf '{"status":"ok","release":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}' ;;
                *) printf '{"status":"ok","release":"%s"}' "$sha" ;;
            esac ;;
        /api/v1/arcade/rules) [[ "$CASE" != rules ]] ;;
        /api/v1/arcade/games) [[ "$CASE" != games ]] ;;
        /api/v1/arcade/leaderboards/*) [[ "$CASE" != leaderboard ]] ;;
        /characters)
            if [[ "$CASE" == characters_network ]]; then return 7; fi
            if [[ "$CASE" == characters_exposed ]]; then printf 200; else printf 404; fi ;;
        /cashier/login)
            if [[ "$CASE" == cashier_network ]]; then return 7; fi
            if [[ "$CASE" == cashier_wrong ]]; then printf 404;
            elif [[ "$ENABLED" == true ]]; then printf 200; else printf 503; fi ;;
        *) return 2 ;;
    esac
}
`;

function run(target, scenario, enabled = false) {
    const [file, marker] = targets[target];
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const start = source.indexOf('\n' + marker + '\n') + 1;
    const actualStart = source.startsWith(marker + '\n') ? 0 : start;
    const end = source.indexOf('\nrm -f "$archive"', actualStart);
    assert.ok(actualStart >= 0 && source.startsWith(marker, actualStart) && end > actualStart);
    const temp = mkdtempSync(join(tmpdir(), 'demian-release-rollback-'));
    try {
        const envFile = join(temp, '.env');
        writeFileSync(envFile, `DEMIAN_COUPONS_CAFE_ENABLED=${enabled}\n`);
        const result = spawnSync('bash', ['-c', harness + '\n' + source.slice(actualStart, end) + '\nprintf "success\\n"\n'], {
            cwd: temp, encoding: 'utf8', timeout: 10000,
            env: { ...process.env, CASE: scenario, ENABLED: String(enabled), env_file: envFile },
        });
        assert.ifError(result.error);
        return result;
    } finally { rmSync(temp, { recursive: true, force: true }); }
}

for (const target of Object.keys(targets)) {
    const failures = ['health_network', 'health_invalid_json', 'health_degraded', 'health_wrong_sha', 'leaderboard',
        ...(target === 'cpanel' ? ['characters_network', 'characters_exposed', 'cashier_network', 'cashier_wrong'] : ['rules', 'games', 'reload'])];
    for (const scenario of failures) {
        test(`${target}: ${scenario} fails closed and rolls back`, () => {
            const result = run(target, scenario);
            assert.equal(result.status, 1, result.stderr + result.stdout);
            assert.equal(result.stdout, 'activate\nrollback\n');
        });
    }
    test(`${target}: all healthy probes retain new release`, () => {
        const result = run(target, 'healthy');
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'activate\nsuccess\n');
    });
}
test('cpanel: enabled cashier must be reachable', () => {
    assert.equal(run('cpanel', 'healthy', true).status, 0);
    const failure = run('cpanel', 'cashier_wrong', true);
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, 'activate\nrollback\n');
});
