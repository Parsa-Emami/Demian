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
