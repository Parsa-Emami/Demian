import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingWeeklySeconds, formatWeeklyCountdown } from '../../../resources/js/game/leaderboard/WeeklyCountdown.js';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

const period = {
    server_time: '2027-01-03T23:59:50+00:00',
    next_reset_at: '2027-01-04T00:00:00+00:00',
};

test('countdown ignores incorrect phone wall clock and expires at the server boundary', () => {
    const received = Date.parse('2020-01-01T00:00:00Z');
    assert.equal(remainingWeeklySeconds(period, received, received), 10);
    assert.equal(remainingWeeklySeconds(period, received, received + 1200), 9);
    assert.equal(remainingWeeklySeconds(period, received, received + 9999), 1);
    assert.equal(remainingWeeklySeconds(period, received, received + 10000), 0);
    assert.equal(remainingWeeklySeconds(period, received, received + 999999), 0);
    assert.equal(remainingWeeklySeconds({ next_reset_at: 'invalid' }), null);
    assert.match(formatWeeklyCountdown(90061), /^۱ روز، ۰۱:۰۱:۰۱$/);
});

test('weekly verified leaderboards are default and practice stays clearly device-local', async () => {
    const calls = [];
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://api.test/api/v1/arcade',
        storage: { getItem: () => null, setItem: () => {} },
        fetcher: async (url, opts) => {
            calls.push({ url, opts });
            return { ok: true, json: async () => ({ data: [], period: 'weekly',
                server_time: period.server_time, next_reset_at: period.next_reset_at }) };
        },
    });
    const result = await service.list();
    assert.equal(result.mode, 'online');
    assert.equal(result.period, 'weekly');
    assert.equal(calls[0].url, 'https://api.test/api/v1/arcade/leaderboards/dino-run?period=weekly&limit=20');
    assert.equal(calls[0].opts.credentials, 'omit');
    const device = await service.list('device');
    assert.equal(device.mode, 'device');
    assert.equal(calls.length, 1);
});

test('account deletion sends authenticated DELETE and clears stored identity on confirmed success', async () => {
    const values = new Map();
    const requests = [];
    const store = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value) };
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://api.test/api/v1/arcade',
        storage: store,
        fetcher: async (url, opts) => {
            requests.push({ url, opts });
            return { ok: true, json: async () => ({ status: 'deleted' }) };
        },
    });
    service.identity = { player_id: 'p-1', token: 'secret' };
    const outcome = await service.eraseAccount();
    assert.equal(outcome.status, 'deleted');
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/player$/);
    assert.equal(requests[0].opts.method, 'DELETE');
    assert.equal(requests[0].opts.headers.Authorization, 'Bearer secret');
    assert.equal(requests[0].opts.credentials, 'omit');
    assert.equal(service.identity, null);
    assert.equal(service.pending, null);
    assert.deepEqual(JSON.parse(values.get('demian.arcade.scores.' + (await import('../../../resources/game/runner-rules.json', { with: { type: 'json' } })).default.version)), []);
});

test('account deletion retains local identity on a failed network request', async () => {
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://api.test/api/v1/arcade',
        storage: { getItem: () => null, setItem: () => {} },
        fetcher: async () => { throw new Error('offline'); },
    });
    service.identity = { player_id: 'p-1', token: 'secret' };
    await assert.rejects(service.eraseAccount(), /offline/);
    assert.equal(service.identity.token, 'secret');
});

test('failed ranked replay persists across reload, retries once and clears only on server acceptance', async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value) };
    const baseUrl = 'https://api.test/api/v1/arcade';
    const first = new ArcadeLeaderboardService({ baseUrl, storage,
        fetcher: async () => { throw new Error('offline'); } });
    first.identity = { player_id: 'owner-1', token: 'secret' };
    storage.setItem(first.identityKey, JSON.stringify(first.identity));
    const ranked = { run_id: '00000000-0000-4000-8000-000000000001', mode: 'ranked' };
    const response = await first.finish(ranked, { score: 25 }, {
        valid: true, payload: () => ({ ticks: 100, transitions: [{ tick: 0, mask: 0 }] }),
    }, 'darya');
    assert.equal(response.status, 'pending');
    assert.ok(first.pending);
    const calls = [];
    const second = new ArcadeLeaderboardService({ baseUrl, storage,
        fetcher: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ status: 'verified', score: 25 }) };
        } });
    assert.equal(second.pending.id, ranked.run_id);
    const accepted = await second.retry();
    assert.equal(accepted.status, 'verified');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/runs\/00000000-0000-4000-8000-000000000001\/complete$/);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(second.pending, null);
    assert.equal(JSON.parse(values.get(second.pendingKey)), null);
});

test('persisted replay cannot be reused by a different identity or replaced when offline', async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value) };
    const baseUrl = 'https://api.test/api/v1/arcade';
    const first = new ArcadeLeaderboardService({ baseUrl, storage,
        fetcher: async () => { throw new Error('offline'); } });
    first.identity = { player_id: 'p1', token: 'one' };
    storage.setItem(first.identityKey, JSON.stringify(first.identity));
    first.savePending({ id: '00000000-0000-4000-8000-000000000001', player_id: 'p1',
        body: { ticks: 10, transitions: [{ tick: 0, mask: 0 }] } });
    const practice = await first.start({ width: 420, character: 'darya' });
    assert.equal(practice.mode, 'practice');
    assert.equal(first.pending.player_id, 'p1');
    storage.setItem(first.identityKey, JSON.stringify({ player_id: 'p2', token: 'two' }));
    const other = new ArcadeLeaderboardService({ baseUrl, storage });
    assert.equal(other.pending, null);
});
