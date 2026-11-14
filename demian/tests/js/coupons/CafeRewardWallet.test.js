import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

function memoryStorage() {
    const map = new Map();
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, value),
        removeItem: key => map.delete(key),
        entries: () => [...map.entries()],
    };
}

const reward = {
    coupon_id: 7, period_key: 'weekly:tehran:2026-11-07',
    game_id: 'dino-run', prize_rank: 1, discount_percent: 30,
    status: 'issued', code: 'DMC-' + 'A'.repeat(32),
    currency: 'IRR', max_discount_minor: 5000,
};

test('coupon wallet fetches only for the authenticated arcade owner', async () => {
    let calls = 0;
    const storage = memoryStorage();
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade-api.example.test/api/v1/arcade',
        storage, identityStorage: storage,
        fetcher: async (url, options) => {
            calls += 1;
            assert.match(url, /\/api\/v1\/arcade\/player\/coupons$/);
            assert.equal(options.headers.Authorization, 'Bearer ' + 'A'.repeat(64));
            assert.equal(options.cache, 'no-store');
            assert.equal(options.credentials, 'omit');
            return { ok: true, json: async () => ({ data: [reward] }) };
        },
    });
    assert.deepEqual(await api.myCoupons(), []);
    assert.equal(calls, 0);
    api.identity = { token: 'A'.repeat(64), player_id: 'test-player' };
    assert.deepEqual(await api.myCoupons(), [reward]);
    assert.equal(calls, 1);
    assert.ok(!storage.entries().some(([, value]) => value.includes(reward.code)));
});

test('coupons are unavailable when no secure API endpoint exists', async () => {
    let requested = false;
    const api = new ArcadeLeaderboardService({
        baseUrl: 'http://insecure.example.test',
        storage: memoryStorage(), identityStorage: memoryStorage(),
        fetcher: async () => { requested = true; throw new Error('unexpected'); },
    });
    api.identity = { token: 'A'.repeat(64) };
    assert.equal(api.connected, false);
    assert.deepEqual(await api.myCoupons(), []);
    assert.equal(requested, false);
});

test('an unauthorized reward response drops stale session credentials', async () => {
    const storage = memoryStorage();
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade-api.example.test/api/v1/arcade',
        storage, identityStorage: storage,
        fetcher: async () => ({ ok: false, status: 401 }),
    });
    api.identity = { token: 'B'.repeat(64), player_id: 'test-player' };
    await assert.rejects(api.myCoupons(), /401/);
    assert.equal(api.identity, null);
    assert.ok(!storage.entries().some(([, value]) => value.includes('B'.repeat(64))));
});
