import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

const makeStorage = () => {
    const values = new Map();
    return {
        values,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: key => { values.delete(key); },
    };
};
const baseUrl = 'https://api.example.test/api/v1/arcade';
const saved = (service, token = 'T'.repeat(64)) => {
    service.identity = { player_id: 'owner', token };
    service.identityStorage.setItem(service.identityKey, JSON.stringify(service.identity));
    service.savePending({ player_id: 'owner', id: '00000000-0000-4000-8000-000000000001',
        body: { ticks: 100, transitions: [{ tick: 0, mask: 1 }] } });
};

test('401 revokes session locally without destroying outstanding replay evidence', async () => {
    const storage = makeStorage();
    const service = new ArcadeLeaderboardService({ baseUrl, storage, fetcher: async () => ({
        ok: false, status: 401,
    }) });
    saved(service);
    const response = await service.retry();
    assert.equal(response.status, 'pending');
    assert.equal(service.identity, null);
    assert.equal(service.pending.player_id, 'owner');
    assert.equal(JSON.parse(storage.getItem(service.pendingKey)).player_id, 'owner');
    const next = new ArcadeLeaderboardService({ baseUrl, storage });
    assert.equal(next.hasRecoveryRequired, true);
    const practice = await next.start({ width: 420, character: 'darya' });
    assert.equal(practice.mode, 'practice');
    assert.match(practice.reason, /بازیابی/);
});

test('server refusal preserves rejected replay rather than claiming success', async () => {
    const storage = makeStorage();
    const service = new ArcadeLeaderboardService({ baseUrl, storage,
        fetcher: async () => ({ ok: false, status: 410 }) });
    saved(service);
    const response = await service.retry();
    assert.equal(response.status, 'rejected');
    assert.equal(response.retryable, false);
    assert.equal(service.pending, null);
    assert.equal(service.rejected.length, 1);
    assert.equal(service.rejected[0].http_status, 410);
    assert.equal(service.rejected[0].player_id, 'owner');
    assert.ok(storage.getItem(service.rejectedKey));
});

test('concurrent connectivity/menu retries share one in-flight POST', async () => {
    const storage = makeStorage();
    let resolve, calls = 0;
    const service = new ArcadeLeaderboardService({ baseUrl, storage,
        fetcher: async () => { calls++; return new Promise(done => { resolve = done; }); },
    });
    saved(service);
    const a = service.retry(), b = service.retry();
    assert.equal(calls, 1);
    resolve({ ok: true, json: async () => ({ status: 'verified', score: 42 }) });
    const results = await Promise.all([a, b]);
    assert.equal(results[0].status, 'verified');
    assert.equal(results[1].status, 'verified');
    assert.equal(service.pending, null);
    assert.equal(storage.getItem(service.pendingKey), 'null');
});

test('recovery for the same owner unlocks an orphaned pending replay', async () => {
    const storage = makeStorage();
    const original = new ArcadeLeaderboardService({ baseUrl, storage });
    saved(original);
    storage.setItem(original.identityKey, 'null');
    const service = new ArcadeLeaderboardService({ baseUrl, storage, fetcher: async () => ({
        ok: true, json: async () => ({ player_id: 'owner', display_name: 'Recovered',
            token: 'R'.repeat(64), token_expires_at: '2027-01-01T00:00:00Z' }),
    }) });
    assert.equal(service.hasRecoveryRequired, true);
    const player = await service.recoverAccount('Q'.repeat(64));
    assert.equal(player.player_id, 'owner');
    assert.equal(service.hasRecoveryRequired, false);
    assert.equal(service.pending.player_id, 'owner');
});

test('real browser defaults migrate legacy localStorage bearer into session storage', () => {
    const priorLocal = globalThis.localStorage, priorSession = globalThis.sessionStorage;
    const local = makeStorage(), session = makeStorage();
    local.setItem('demian.arcade.identity.v1:' + baseUrl,
        JSON.stringify({ player_id: 'owner', token: 'S'.repeat(64) }));
    globalThis.localStorage = local;
    globalThis.sessionStorage = session;
    try {
        const service = new ArcadeLeaderboardService({ baseUrl });
        assert.equal(service.identity?.token, 'S'.repeat(64));
        assert.equal(local.getItem(service.identityKey), null);
        assert.equal(JSON.parse(session.getItem(service.identityKey)).token, 'S'.repeat(64));
    } finally {
        if (priorLocal === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = priorLocal;
        if (priorSession === undefined) delete globalThis.sessionStorage;
        else globalThis.sessionStorage = priorSession;
    }
});

test('configured cleartext third-party arcade API cannot receive a bearer', async () => {
    let requests = 0;
    const service = new ArcadeLeaderboardService({ baseUrl: 'http://unsafe.example.test/api/v1/arcade',
        storage: makeStorage(), fetcher: async () => { requests++; throw new Error('unexpected'); } });
    service.identity = { player_id: 'owner', token: 'T'.repeat(64) };
    const practice = await service.start({ width: 420, character: 'darya' });
    assert.equal(practice.mode, 'practice');
    assert.equal(requests, 0);
    assert.equal(service.connected, false);
});

test('server-side erasure is forbidden when account marker survives without bearer', async () => {
    const storage = makeStorage();
    const service = new ArcadeLeaderboardService({ baseUrl, storage, fetcher: async () => {
        throw new Error('must not contact server');
    } });
    storage.setItem(service.accountMarkerKey, 'true');
    service.accountKnown = true;
    await assert.rejects(service.eraseAccount(), /بازیابی/);
    assert.equal(storage.getItem(service.accountMarkerKey), 'true');
});

test('rejected-evidence archive storage failure preserves pending replay', async () => {
    const storage = makeStorage();
    const originalSet = storage.setItem;
    storage.setItem = (key, value) => {
        if (key.includes('.rejected.')) throw new Error('QuotaExceededError');
        originalSet(key, value);
    };
    const service = new ArcadeLeaderboardService({ baseUrl, storage, fetcher: async () => ({
        ok: false, status: 422,
    }) });
    saved(service);
    const result = await service.retry();
    assert.equal(result.status, 'rejected');
    assert.equal(service.rejected.length, 0);
    assert.equal(service.pending.player_id, 'owner');
    assert.ok(storage.getItem(service.pendingKey));
});
