import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

test('Phase 3 Step 16 uses only bearer-authenticated, no-store private owner endpoints', async () => {
    const calls = [];
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade-api.example.test/api/v1/arcade',
        storage: null, identityStorage: null,
        fetcher: async (url, request) => {
            calls.push({ url, request });
            return { ok: true, json: async () => ({ data: {
                coupon_id: 42, status: 'open',
            } }) };
        },
    });
    await assert.rejects(api.acknowledgeCoupon(42));
    await assert.rejects(api.reportCoupon(42, 'invalid_code'));
    assert.equal(calls.length, 0);

    api.identity = { token: 'B'.repeat(64), player_id: 'owner-42' };
    await assert.rejects(api.acknowledgeCoupon(-3));
    await assert.rejects(api.reportCoupon(42, 'unknown'));
    assert.equal(calls.length, 0);

    const acknowledge = await api.acknowledgeCoupon(42);
    assert.equal(acknowledge.coupon_id, 42);
    const dispute = await api.reportCoupon(42, 'invalid_code', 'کد هنگام خرید کار نکرد');
    assert.equal(dispute.status, 'open');
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/player\/coupons\/42\/acknowledge$/);
    assert.match(calls[1].url, /\/player\/coupons\/42\/disputes$/);
    for (const { request } of calls) {
        assert.equal(request.method, 'POST');
        assert.equal(request.cache, 'no-store');
        assert.equal(request.credentials, 'omit');
        assert.equal(request.referrerPolicy, 'no-referrer');
        assert.equal(request.headers.Authorization, 'Bearer ' + 'B'.repeat(64));
    }
    const body = JSON.parse(calls[1].request.body);
    assert.match(body.request_key, /^[0-9a-f-]{36}$/i);
    assert.equal(body.category, 'invalid_code');
    assert.equal(body.description, 'کد هنگام خرید کار نکرد');
    assert.ok(!JSON.stringify(calls).includes('DMC-'));
    assert.equal(api.identity.player_id, 'owner-42');
});

test('Phase 3 Step 16 support actions fail closed on unconfigured or invalid requests', async () => {
    const api = new ArcadeLeaderboardService({
        baseUrl: 'https://arcade-api.example.test/api/v1/arcade',
        storage: null, identityStorage: null,
        fetcher: async () => { throw new Error('unexpected network call'); },
    });
    api.identity = { token: 'A'.repeat(64), player_id: 'owner' };
    await assert.rejects(api.reportCoupon(1, 'other', 'x'.repeat(301)));
    await assert.rejects(api.acknowledgeCoupon(0));
    await assert.rejects(api.reportCoupon(NaN, 'other'));
    api.identity = null;
    await assert.rejects(api.reportCoupon(1, 'other'));
});
