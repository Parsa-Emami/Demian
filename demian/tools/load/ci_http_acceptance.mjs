import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { firstCollisionReplay } from './runner_first_collision.js';
import { runnerWeek, WEEKLY_VERSIONS } from '../../resources/js/game/content/WeeklyContent.js';

assert.equal(process.env.CI, 'true');
assert.equal(process.env.APP_ENV, 'testing');
assert.equal(process.env.DB_CONNECTION, 'mysql');
assert.equal(process.env.DB_DATABASE, 'demian_test');
assert.equal(process.env.DB_HOST, '127.0.0.1');
assert.equal(process.env.CACHE_STORE, 'file');
assert.equal(process.env.DB_USERNAME, 'root');
assert.ok(!process.env.DB_URL);
execFileSync('php', ['artisan', 'migrate:fresh', '--force', '--no-interaction'], { stdio: 'ignore', timeout: 60000 });
execFileSync('php', ['artisan', 'cache:clear'], { stdio: 'ignore', timeout: 30000 });
const base = 'http://127.0.0.1:8088/api/v1/arcade';
const output = 'docs/acceptance-lab';
mkdirSync(output, { recursive: true });
const report = { status: 'pending', environment: 'isolated CI MySQL 8.4 with eight PHP HTTP workers and OPcache',
    physicalDeviceVerified: false, productionCapacityCertified: false, independentSecurityAudit: false,
    users: 50, security: [], timings: {}, failures: [] };
let server, spawnError;
const samples = new Map();
async function request(path, { token, body, method = body === undefined ? 'GET' : 'POST', group } = {}) {
    const started = performance.now();
    const response = await fetch(base + path, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (group) {
        const rows = samples.get(group) ?? [];
        rows.push(performance.now() - started); samples.set(group, rows);
    }
    if (response.status >= 500) {
        const exception = /^[A-Za-z\\\\]{1,120}$/.test(data?.exception ?? '') ? data.exception : 'unknown';
        const sqlState = /SQLSTATE\[([0-9A-Z]{5})\]/.exec(data?.message ?? '')?.[1];
        throw new Error(`HTTP ${response.status} for ${path.replace(/[a-f0-9-]{36}/g, ':run')} (${exception}${sqlState ? ', SQLSTATE ' + sqlState : ''})`);
    }
    return { status: response.status, data, headers: response.headers };
}
async function probe(name, expected, path, options) {
    const result = await request(path, options);
    assert.equal(result.status, expected, name);
    report.security.push({ name, expected, actual: result.status, passed: true });
    return result;
}
try {
    const phpOptions = ['-d', 'opcache.enable_cli=1'];
    const opcacheCheck = 'echo function_exists("opcache_get_status") && opcache_get_status() ? "enabled" : "disabled";';
    assert.equal(execFileSync('php', [...phpOptions, '-r', opcacheCheck], { encoding: 'utf8', timeout: 30000 }),
        'enabled', 'Enable PHP OPcache for the HTTP acceptance test');
    server = spawn('php', [...phpOptions, '-S', '127.0.0.1:8088', '-t', resolve('public'),
        resolve('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], {
        cwd: resolve('public'), detached: true, stdio: 'ignore', env: { ...process.env, PHP_CLI_SERVER_WORKERS: '8', APP_DEBUG: 'true' },
    });
    server.on('error', error => { spawnError = error; });
    let ready = false, readinessError = '';
    server.on('exit', code => { if (!ready) readinessError = 'PHP HTTP server exited with code ' + code; });
    for (let attempt = 0; attempt < 80; attempt++) {
        if (spawnError) throw spawnError;
        try { if ((await request('/rules')).status === 200) { ready = true; break; } } catch (error) { readinessError = error.message; }
        await delay(250);
    }
    assert.ok(ready, 'Disposable API failed to become ready: ' + readinessError);
    const rules = (await request('/rules')).data.rules;
    const policy = (await request('/legal')).data;
    assert.equal(policy.require_contact, true, 'Required contacts must be enabled for the registration acceptance check');
    const identities = await Promise.all(Array.from({ length: 50 }, async (_, index) => {
        const response = await request('/players', {
            body: {
                display_name: 'CI Player ' + index,
                contact_type: 'email',
                contact_value: `ci-player-${index}@example.test`,
                registration_key: randomUUID(),
                policy_version: policy.version ?? policy.policy_version,
                accept_terms: true,
                privacy_acknowledged: true,
            },
            group: 'register',
        });
        const fieldErrors = Object.keys(response.data?.errors ?? {}).join(', ');
        assert.equal(response.status, 201, `Registration failed for fixture ${index}${fieldErrors ? ' · ' + fieldErrors : ''}`);
        assert.equal(response.data.has_contact, true);
        assert.equal(typeof response.data.token, 'string');
        return response.data;
    }));
    const starts = await Promise.all(identities.map(async ({ token }) => {
        const payload = { request_id: randomUUID(), game_id: 'dino-run', character_slug: 'darya',
            track_width: 420, rules_version: rules.version };
        const result = await request('/runs', { token, body: payload, group: 'start' });
        assert.equal(result.status, 201, 'Run start failed: ' + (result.data?.message ?? 'unknown'));
        const profile = rules.version === WEEKLY_VERSIONS['dino-run'] ? runnerWeek(rules, result.data.content_week, payload.character_slug) : rules;
        const replay = firstCollisionReplay(profile, result.data.seed, 420);
        return { ...result.data, token, payload, replay, readyAt: Date.now() + replay.elapsedSeconds * 1000 + 300 };
    }));
    await probe('missing bearer', 401, '/player');
    await probe('forged bearer', 401, '/player', { token: 'A'.repeat(64) });
    await probe('cross-account completion', 404, '/runs/' + starts[0].run_id + '/complete',
        { token: starts[1].token, body: starts[0].replay });
    await probe('impossible control mask', 422, '/runs/' + starts[0].run_id + '/complete',
        { token: starts[0].token, body: { ticks: 1, transitions: [{ tick: 0, mask: 255 }] } });
    await probe('accelerated replay', 422, '/runs/' + starts[0].run_id + '/complete',
        { token: starts[0].token, body: { ticks: 54000, transitions: [{ tick: 0, mask: 3 }] } });
    await probe('bounded payload', 413, '/runs', { token: starts[0].token, body: { padding: 'x'.repeat(262145) } });
    await probe('invalid rules', 409, '/runs', { token: starts[1].token, body: { ...starts[1].payload,
        request_id: randomUUID(), rules_version: 'untrusted' } });
    const waitMs = Math.max(...starts.map(row => row.readyAt)) - Date.now();
    if (waitMs > 0) await delay(waitMs);
    const complete = await Promise.all(starts.flatMap(row => [0, 1].map(async () => {
        const result = await request('/runs/' + row.run_id + '/complete', { token: row.token,
            body: { ticks: row.replay.ticks, transitions: row.replay.transitions, score: 999999999 }, group: 'complete' });
        assert.equal(result.status, 200, 'Concurrent completion failed');
        assert.equal(result.data.status, 'verified');
        assert.equal(result.data.verification, 'server-replay');
        assert.equal(result.data.ticks, row.replay.ticks);
        assert.ok(Number.isInteger(result.data.score) && result.data.score < 999999999);
        return result.data;
    })));
    for (let index = 0; index < starts.length; index++) assert.deepEqual(complete[index * 2], complete[index * 2 + 1]);
    const retries = await Promise.all(starts.flatMap(row => [0, 1].map(() => request('/runs/' + row.run_id + '/complete',
        { token: row.token, body: row.replay, group: 'duplicate' }))));
    retries.forEach((result, index) => { assert.equal(result.status, 200); assert.deepEqual(result.data, complete[Math.floor(index / 2) * 2]); });
    report.security.push({ name: 'forged score ignored and racing initial submissions and 100 duplicate receipts identical', passed: true });
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt++) {
        const result = await request('/runs', { token: starts[49].token, body: starts[49].payload });
        if (result.status === 429) { limited = true; break; }
        assert.equal(result.status, 409);
    }
    assert.ok(limited, 'Per-player rate limit did not engage');
    await probe('NAT peer remains eligible', 201, '/runs', { token: starts[48].token,
        body: { ...starts[48].payload, request_id: randomUUID() } });
    report.security.push({ name: 'shared-cache rate limiting preserves unrelated café players', passed: true });
    for (const [group, values] of samples) {
        values.sort((a, b) => a - b);
        const percentile = p => Math.round(values[Math.ceil(values.length * p) - 1]);
        report.timings[group] = { count: values.length, p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: Math.round(values.at(-1)) };
    }
    assert.ok(report.timings.complete.p95Ms < 2000, '50-player completion p95 exceeded 2 seconds');
    assert.ok(report.timings.complete.p99Ms < 4000, '50-player completion p99 exceeded 4 seconds');
    const integrity = JSON.parse(execFileSync('php', ['artisan', 'arcade:integrity', '--json'], { encoding: 'utf8', timeout: 30000 }));
    assert.equal(integrity.status, 'ok');
    report.integrity = integrity;
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failures.push(error.message); process.exitCode = 1;
} finally {
    if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
    writeFileSync(output + '/http.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
