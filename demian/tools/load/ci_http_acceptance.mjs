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
const users = Number(process.env.DEMIAN_CI_LOAD_USERS ?? 50);
assert.ok(users === 50 || users === 100, 'Only the isolated 50/100-client CI profiles are authorized');
const hundred = users === 100;
const httpWorkers = hundred ? 16 : 8;
let activeRequests = 0, maxInFlightRequests = 0;
execFileSync('php', ['artisan', 'migrate:fresh', '--force', '--no-interaction'], { stdio: 'ignore', timeout: 60000 });
execFileSync('php', ['artisan', 'cache:clear'], { stdio: 'ignore', timeout: 30000 });
const base = 'http://127.0.0.1:8088/api/v1/arcade';
const output = 'docs/acceptance-lab';
mkdirSync(output, { recursive: true });
const report = { schema: 2, phase: 'PR09', sourceSha: process.env.GITHUB_SHA,
    status: 'pending',
    environment: 'disposable CI MySQL 8.4 / PHP CLI server / OPcache',
    physicalDeviceVerified: false, productionCapacityCertified: false,
    independentSecurityAudit: false, realHostCapacityVerified: false,
    loadProfile: hundred ? '100-inflight-http-clients' : '50-inflight-http-clients',
    users, phpHttpWorkers: httpWorkers, security: [], timings: {}, failures: [],
    verifiedRuns: 0, initialReplayAttempts: 0, duplicateReplayAttempts: 0,
    registrationBatches: [], maxInFlightRequests: 0, maxObservedConnections: null,
    noRealPrizeIssuance: true, noProductionWrites: true };
let server, spawnError;
const samples = new Map();
async function request(path, { token, body, method = body === undefined ? 'GET' : 'POST', group } = {}) {
    const started = performance.now();
    activeRequests++;
    maxInFlightRequests = Math.max(maxInFlightRequests,activeRequests);
    let response;
    try {
      response = await fetch(base + path, { method, redirect: 'manual',
        signal: AbortSignal.timeout(hundred ? 30000 : 15000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } finally {
      activeRequests--;
    }
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
        cwd: resolve('public'), detached: true, stdio: 'ignore', env: { ...process.env, PHP_CLI_SERVER_WORKERS: String(httpWorkers), APP_DEBUG: 'true' },
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
    // The real public registration gate is 60/IP/minute: deliberately DO NOT
    // bypass it or weaken its policy to prepare a 100-client test.
    // Register in authorized <=50-IP-request waves; gameplay starts together.
    const identities = [];
    for (let offset = 0; offset < users; offset += 50) {
      if (offset > 0) await delay(62000);
      const count = Math.min(50, users - offset);
      const wave = await Promise.all(Array.from({length:count}, async (_,i)=>{
        const index = offset + i;
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
      identities.push(...wave);
      report.registrationBatches.push({clients:wave.length,registrationIpLimitPreserved:true});
    }
    assert.equal(identities.length,users);
    assert.equal(new Set(identities.map(x=>x.player_id)).size,users);
    assert.equal(new Set(identities.map(x=>x.token)).size,users);
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
    report.verifiedRuns = starts.length;
    report.initialReplayAttempts = complete.length;
    assert.equal(new Set(starts.map(x=>x.run_id)).size,users);
    assert.equal(complete.length,users*2);
    assert.ok(maxInFlightRequests>=users,
        'Insufficient 100-client HTTP concurrency; PHP workers can be fewer than clients');
    const retries = await Promise.all(starts.flatMap(row => [0, 1].map(() => request('/runs/' + row.run_id + '/complete',
        { token: row.token, body: row.replay, group: 'duplicate' }))));
    retries.forEach((result, index) => { assert.equal(result.status, 200); assert.deepEqual(result.data, complete[Math.floor(index / 2) * 2]); });
    report.duplicateReplayAttempts = retries.length;
    assert.equal(retries.length,users*2);
    // One hundred separately authenticated simultaneous profile reads,
    // then one hundred leaderboard reads. No score or wallet writes.
    const profiles = await Promise.all(identities.map(({token})=>
        request('/player',{token,group:'identity'})));
    profiles.forEach(({status,data},index)=>{
        assert.equal(status,200,'Authenticated player profile under load');
        assert.equal(data?.player_id,identities[index].player_id,
            'Token must not read a peer identity behind the same NAT');
    });
    const boards = await Promise.all(Array.from({length:users},()=>
        request('/leaderboards/dino-run?period=weekly',{group:'leaderboard'})));
    boards.forEach(({status,data})=>{
        assert.equal(status,200,'Weekly leaderboard query under 100-client burst');
        assert.ok(Array.isArray(data?.data),'Leaderboard response contract');
    });
    report.security.push({
        name:'100 authenticated identities isolated and weekly leaderboard safe under concurrency',
        passed:true,
    });
    report.security.push({ name: 'forged score ignored and racing initial submissions and idempotent duplicate receipts', passed: true });
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt++) {
        const result = await request('/runs', { token: starts[users-1].token, body: starts[users-1].payload });
        if (result.status === 429) { limited = true; break; }
        assert.equal(result.status, 409);
    }
    assert.ok(limited, 'Per-player rate limit did not engage');
    await probe('NAT peer remains eligible', 201, '/runs', { token: starts[users-2].token,
        body: { ...starts[users-2].payload, request_id: randomUUID() } });
    report.security.push({ name: 'shared-cache rate limiting preserves unrelated café players', passed: true });
    for (const [group, values] of samples) {
        values.sort((a, b) => a - b);
        const percentile = p => Math.round(values[Math.ceil(values.length * p) - 1]);
        report.timings[group] = { count: values.length, p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: Math.round(values.at(-1)) };
    }
    assert.ok(report.timings.complete.p95Ms < (hundred ? 4000 : 2000),
        'Replay completion p95 exceeded the isolated CI profile budget');
    assert.ok(report.timings.complete.p99Ms < (hundred ? 8000 : 4000),
        'Replay completion p99 exceeded the isolated CI profile budget');
    report.maxInFlightRequests = maxInFlightRequests;
    for (const group of ['identity','leaderboard']) {
        assert.ok(report.timings[group].p95Ms < (hundred ? 4000 : 2000),
            group+' burst p95 exceeded CI budget');
        assert.ok(report.timings[group].p99Ms < (hundred ? 8000 : 4000),
            group+' burst p99 exceeded CI budget');
    }
    const integrity = JSON.parse(execFileSync('php', ['artisan', 'arcade:integrity', '--json'], { encoding: 'utf8', timeout: 30000 }));
    assert.equal(integrity.status, 'ok');
    report.integrity = integrity;
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failures.push(error.message); process.exitCode = 1;
} finally {
    if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
    report.maxInFlightRequests = maxInFlightRequests;
    writeFileSync(output + (hundred ? '/http-100.json' : '/http.json'),
        JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
