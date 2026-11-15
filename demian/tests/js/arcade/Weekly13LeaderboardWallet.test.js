import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

const identity = { player_id: 'owner-1', token: 'T'.repeat(64) };
const memoryStorage = () => {
    const values = new Map();
    return { values,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
};

test('public current and historic week queries are bounded and never send owner bearer token', async () => {
    const calls = [];
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade.example.test/api/v1/arcade',
        storage: memoryStorage(), identityStorage: memoryStorage(),
        fetcher: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ status: 'live_preview', weeks: [
                { week: '2026-11-07', status: 'finalized' }] }) };
        },
    });
    api.identity = identity;
    assert.equal((await api.weeklyRanking()).status, 'live_preview');
    await api.weeklyRanking('2026-11-07');
    assert.deepEqual(await api.weeklyWeeks(), [{ week: '2026-11-07', status: 'finalized' }]);
    assert.deepEqual(calls.map(x => x.url), [
        'https://arcade.example.test/api/v1/arcade/competition/leaderboard',
        'https://arcade.example.test/api/v1/arcade/competition/leaderboard?week=2026-11-07',
        'https://arcade.example.test/api/v1/arcade/competition/leaderboard/weeks',
    ]);
    for (const { options } of calls) {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.referrerPolicy, 'no-referrer');
    }
    await assert.rejects(api.weeklyRanking('2026/11/07'), /معتبر/);
    assert.equal(calls.length, 3);
});

test('exact personal position uses authenticated GET only, without caller supplied player_id', async () => {
    const calls = [];
    const store = memoryStorage();
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade.example.test/api/v1/arcade',
        storage: store, identityStorage: store,
        fetcher: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({
                my_rank: 47, participants: 73,
                my_best: { competition_points: 425, qualified: true },
            }) };
        },
    });
    assert.equal(await api.myWeeklyRanking(), null);
    assert.equal(calls.length, 0);
    api.identity = identity;
    const mine = await api.myWeeklyRanking('2026-11-07');
    assert.equal(mine.my_rank, 47);
    assert.equal(mine.my_best.competition_points, 425);
    assert.match(calls[0].url, /\/player\/competition\/leaderboard\?week=2026-11-07$/);
    assert.doesNotMatch(calls[0].url, /owner-1|player_id/);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + 'T'.repeat(64));
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.ok(![...store.values.values()].some(value => value.includes('425')));
});

test('expired auth in private rank query clears token without preventing future public rankings', async () => {
    const store = memoryStorage();
    const calls = [];
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade.example.test/api/v1/arcade',
        storage: store, identityStorage: store,
        fetcher: async (url, options) => {
            calls.push({ url, options });
            return url.includes('/player/')
                ? { ok: false, status: 401 }
                : { ok: true, json: async () => ({ status: 'live_preview', data: [] }) };
        },
    });
    api.identity = identity;
    store.setItem(api.identityKey, JSON.stringify(identity));
    assert.equal(await api.myWeeklyRanking(), null);
    assert.equal(api.identity, null);
    assert.ok(![...store.values.values()].some(v => v.includes(identity.token)));
    assert.equal((await api.weeklyRanking()).status, 'live_preview');
    assert.equal(calls[1].options.headers.Authorization, undefined);
});

test('dedicated wallet remains owner-only and never triggers an email or saves codes to storage', async () => {
    const store = memoryStorage();
    const requests = [];
    const code = 'DMC-' + 'C'.repeat(32);
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade.example.test/api/v1/arcade',
        storage: store, identityStorage: store,
        fetcher: async (url, options) => {
            requests.push({ url, options });
            return { ok: true, json: async () => ({ data: [{
                coupon_id: 3, discount_percent: 30, code,
                max_discount_minor: 5000, currency: 'IRR', status: 'issued',
            }] }) };
        },
    });
    assert.deepEqual(await api.myCoupons(), []);
    assert.equal(requests.length, 0);
    api.identity = identity;
    const wallet = await api.myCoupons();
    assert.equal(wallet[0].discount_percent, 30);
    assert.equal(wallet[0].code, code);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/player\/coupons$/);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + identity.token);
    assert.equal(requests[0].options.cache, 'no-store');
    assert.equal(requests[0].options.referrerPolicy, 'no-referrer');
    assert.ok(![...store.values.values()].some(v => v.includes(code)));
    const source = readFileSync(resolve(import.meta.dirname,
        '../../../resources/js/game/shell/screens/CouponWalletScreen.js'), 'utf8');
    assert.match(source, /this\.service\.myCoupons\(\)/);
    assert.doesNotMatch(source, /sendMail|mailto:|sendEmail|localStorage|sessionStorage/);
    assert.match(source, /beforeClose/);
});

test('no real endpoint means no private wallet or week requests', async () => {
    let called = false;
    const api = new ArcadeLeaderboardService({
        baseUrl: 'http://remote-untrusted.test/api/v1/arcade',
        storage: memoryStorage(),
        fetcher: async () => { called = true; throw Error('Unsafe outbound call'); },
    });
    api.identity = identity;
    assert.equal(api.connected, false);
    assert.deepEqual(await api.myCoupons(), []);
    assert.deepEqual(await api.weeklyWeeks(), []);
    await assert.rejects(api.weeklyRanking(), /آنلاین/);
    assert.equal(called, false);
});
