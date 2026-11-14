import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
import CafeCrittersModel from '../../../resources/js/game/games/cafe-critters/CafeCrittersModel.js';
import { CRITTERS } from '../../../resources/js/game/games/cafe-critters/CafeCrittersData.js';

function memoryStorage() {
    const entries = new Map();
    return {
        getItem: key => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: key => entries.delete(key),
        entries: () => [...entries.entries()],
    };
}

const auth = { player_id: '10000000-0000-4000-a000-000000000001',
    token: 'A'.repeat(64) };

test('ranked Critters challenge uses authenticated HTTPS and server issued rotation', async () => {
    const seen = [];
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://example.test/api/v1/arcade',
        storage: memoryStorage(), identityStorage: memoryStorage(),
        fetcher: async (url, options) => {
            seen.push({ url, options });
            return { ok: true, json: async () => ({
                run_id: '11111111-2222-4333-8444-555555555555',
                game_id: 'cafe-critters',
                seed: 113,
                rules_version: 'cafe-critters-replay-v1',
            }) };
        },
    });
    service.identity = auth;
    const run = await service.startTurnRun('cafe-critters');
    assert.equal(run.mode, 'ranked');
    assert.equal(run.seed, 113);
    assert.equal(seen.length, 1);
    assert.match(seen[0].url, /\/turn-runs$/);
    assert.equal(seen[0].options.headers.Authorization, 'Bearer ' + auth.token);
    assert.equal(seen[0].options.cache, 'no-store');
    const model = new CafeCrittersModel('standard', CRITTERS.map(g => g.id),
        run.seed % CRITTERS.length);
    assert.deepEqual(model.targets.map(g => g.id), ['rosha', 'varagh', 'tootak']);
});

test('Coffee Crash challenge requires exact scoring version', async () => {
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://example.test/api/v1/arcade',
        storage: memoryStorage(), identityStorage: memoryStorage(),
        fetcher: async (url, options) => {
            const input = JSON.parse(options.body);
            assert.equal(input.game_id, 'coffee-crash');
            assert.equal(input.rules_version, 'coffee-crash-replay-v1');
            return { ok: true, json: async () => ({
                game_id: 'coffee-crash', seed: 4301, rules_version: input.rules_version,
                run_id: '22222222-2222-4222-8222-222222222222',
            }) };
        },
    });
    service.identity = auth;
    assert.equal((await service.startTurnRun('coffee-crash')).mode, 'ranked');
    assert.equal((await service.startTurnRun('cafe-rush')).mode, 'practice');
});

test('turn run stores evidence without bearer and submits its own endpoint', async () => {
    const storage = memoryStorage();
    const seen = [];
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://example.test/api/v1/arcade',
        storage, identityStorage: memoryStorage(),
        fetcher: async (url, options) => {
            seen.push({ url, options });
            assert.match(url, /\/turn-runs\/[a-f0-9-]+\/complete$/);
            return { ok: true, json: async () => ({ status: 'verified', score: 4000 }) };
        },
    });
    service.identity = auth;
    const run = { mode: 'ranked', game_id: 'cafe-critters',
        run_id: '33333333-3333-4333-8333-333333333333' };
    const actions = Array.from({ length: 15 }, (_, i) => ({
        tick: (i+1)*20, kind: 'invite',
    }));
    const result = await service.finishTurnRun(run, actions, 301);
    assert.equal(result.status, 'verified');
    assert.equal(seen.length, 1);
    assert.equal(service.pending, null);
    assert.equal(seen[0].options.cache, 'no-store');
    assert.ok(!storage.entries().some(([, value]) => value.includes(auth.token)));
});

test('offline API never promises unverified scores', async () => {
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://example.test/api/v1/arcade',
        storage: memoryStorage(), identityStorage: memoryStorage(),
        fetcher: async () => ({ ok: false, status: 503 }),
    });
    service.identity = auth;
    assert.equal((await service.startTurnRun('cafe-critters')).mode, 'practice');
    assert.deepEqual((await service.list('device', 'coffee-crash')).data, []);
    assert.deepEqual((await service.list('device', 'cafe-critters')).data, []);
    await assert.rejects(service.list('weekly', 'open-world'), /Unknown ranked game/);
});
