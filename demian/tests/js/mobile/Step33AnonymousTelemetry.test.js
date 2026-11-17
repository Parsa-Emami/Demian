import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import AnonymousGameTelemetry from '../../../resources/js/game/performance/AnonymousGameTelemetry.js';

const api = 'https://api.demiancafe.ir/api/v1/arcade';

test('Step33: default-off telemetry creates zero network requests', () => {
    let calls = 0;
    const sample = new AnonymousGameTelemetry({ enabled: false, baseUrl: api,
        fetcher: async () => { calls++; return { ok: true }; } });
    sample.emit('game_load', { game: 'open-world', durationMs: 1500 });
    sample.emit('game_error', { game: 'dino-run' });
    sample.frame(0, 'dino-run', true);
    sample.frame(12000, 'dino-run', true);
    assert.equal(calls, 0);
});

test('Step33: only bounded, whitelisted and anonymous client metrics leave browser', async () => {
    const requests = [];
    let now = 1;
    const telemetry = new AnonymousGameTelemetry({
        enabled: true, baseUrl: api, clock: () => now,
        fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
    });
    assert.equal(telemetry.emit('game_load', {
        game: 'open-world', durationMs: 2500, bearer: 'not allowed',
    }), true);
    assert.equal(telemetry.emit('game_load', { game: 'open-world', durationMs: 2000 }), false);
    assert.equal(telemetry.emit('game_error', { game: 'malicious' }), false);
    assert.equal(telemetry.emit('stack', { game: 'dino-run' }), false);
    now += 20000;
    assert.equal(telemetry.emit('game_load', { game: 'open-world', durationMs: 999999 }), true);
    assert.equal(telemetry.emit('fps', { game: 'dino-run', fps: 987 }), true);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(item => item.url === api + '/telemetry'));
    assert.ok(requests.every(item => item.options.credentials === 'omit'));
    assert.ok(requests.every(item => item.options.referrerPolicy === 'no-referrer'));
    assert.ok(requests.every(item => item.options.keepalive === true));
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        kind: 'game_load', game: 'open-world', duration_ms: 2500,
    });
    assert.equal(JSON.parse(requests[1].options.body).duration_ms, 60000);
    assert.equal(JSON.parse(requests[2].options.body).fps, 120);
    assert.equal(JSON.stringify(requests).includes('not allowed'), false);
});

test('Step33: no cleartext client endpoint and no unbounded retries after network failures', async () => {
    let attempts = 0;
    const unsafe = new AnonymousGameTelemetry({ enabled: true,
        baseUrl: 'http://example.test/api/v1/arcade',
        fetcher: () => { attempts++; throw Error('should not send'); },
    });
    assert.equal(unsafe.emit('menu_ready', { durationMs: 200 }), false);
    const telemetry = new AnonymousGameTelemetry({
        enabled: true, baseUrl: api, fetcher: async () => {
            attempts++; throw Error('telemetry blocked');
        },
    });
    assert.equal(telemetry.emit('game_error', { game: 'open-world' }), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 1);
    assert.equal(telemetry.sent, 1);
});

test('Step33: FPS samples use a ten-second foreground window and reset when paused', () => {
    const req = [];
    const client = new AnonymousGameTelemetry({ enabled: true, baseUrl: api,
        clock: () => 30000, fetcher: async (_, opts) => { req.push(JSON.parse(opts.body)); } });
    client.frame(0, 'open-world', true);
    for (let i = 1; i <= 600; i++) client.frame(i * 1000 / 60, 'open-world', true);
    assert.equal(req.length, 1);
    assert.equal(req[0].kind, 'fps');
    assert.ok(req[0].fps >= 55 && req[0].fps <= 65);
    client.frame(11000, 'open-world', false);
    assert.equal(client.frameStart, null);
});

test('Step33: game lifecycle integration is registered without touching score or replay payload', () => {
    const application = readFileSync(new URL('../../../resources/js/game/application/GameApplication.js',
        import.meta.url), 'utf8');
    assert.match(application, /new GameMetrics/);
    assert.match(application, /opsTelemetry\?\.frame/);
    assert.match(application, /this\.opsMetrics\?\.dispose/);
    const template = readFileSync(new URL('../../../resources/views/demian.blade.php',
        import.meta.url), 'utf8');
    assert.match(template, /name="demian-ops-client" content="off"/);
});
