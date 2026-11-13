import test from 'node:test';
import assert from 'node:assert/strict';
import CharacterVisualService from '../../../resources/js/game/characters/runtime/CharacterVisualService.js';
import {
    SpriteLoadGate, spriteCacheBudgetBytes, decodedSpriteBytes,
    cachedSpriteBytes, trimSpriteCache,
} from '../../../resources/js/game/characters/runtime/SpriteMemoryPolicy.js';

const MiB = 1024 * 1024;
const pack = (slug, variant = 'lite', width = 1024, height = 1024) => ({
    slug, variant, image: { naturalWidth: width, naturalHeight: height },
    atlas: { meta: { variant, size: { w: width, h: height } } },
});

test('tier-aware cache budgets remain conservative without navigator.deviceMemory', () => {
    assert.equal(spriteCacheBudgetBytes({ tier: 'performance' }, undefined), 8 * MiB);
    assert.equal(spriteCacheBudgetBytes({ tier: 'balanced' }, undefined), 20 * MiB);
    assert.equal(spriteCacheBudgetBytes({ tier: 'high' }, undefined), 40 * MiB);
    assert.equal(spriteCacheBudgetBytes({ tier: 'high' }, 2), 8 * MiB);
    assert.equal(spriteCacheBudgetBytes({ tier: 'high' }, null), 40 * MiB);
    assert.equal(spriteCacheBudgetBytes({ tier: 'balanced' }, NaN), 20 * MiB);
});

test('decoded image bytes derive from pixel dimensions, never compressed PNG size', () => {
    assert.equal(decodedSpriteBytes(pack('darya', 'lite', 1000, 500)), 2_000_000);
    assert.equal(decodedSpriteBytes({ atlas: { meta: { size: { w: 100, h: 200 } } } }), 80_000);
    assert.equal(decodedSpriteBytes({ image: { naturalWidth: 0, naturalHeight: 200 } }), 0);
});

test('cache evicts old images, does not close live shared images and retains lone oversize pack', () => {
    let closeCount = 0;
    const a = pack('darya', 'lite', 1024, 1024);
    a.image.close = () => closeCount++;
    const b = pack('negar', 'lite', 1024, 1024);
    const c = pack('tiam', 'lite', 2048, 2048);
    const cache = new Map([['a', a], ['b', b], ['c', c]]);
    assert.equal(cachedSpriteBytes(cache), 24 * MiB);
    const result = trimSpriteCache(cache, 8 * MiB);
    assert.equal(result.entries, 1);
    assert.equal(result.bytes, 16 * MiB);
    assert.equal(result.overBudget, true);
    assert.deepEqual([...cache.keys()], ['c']);
    assert.equal(closeCount, 0, 'live renderers may still own old images');
    assert.throws(() => trimSpriteCache(cache, 0), RangeError);
});

test('FIFO gate bounds concurrent decodes and tracks the true peak', async () => {
    const gate = new SpriteLoadGate(2);
    let active = 0, peak = 0;
    const values = await Promise.all(Array.from({ length: 8 }, (_, index) => gate.run(async () => {
        active++; peak = Math.max(peak, active);
        await new Promise(done => setTimeout(done, 2));
        active--;
        return index;
    })));
    assert.deepEqual(values, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(peak, 2);
    assert.equal(gate.snapshot().highWatermark, 2);
    assert.equal(gate.snapshot().queued, 0);
    assert.equal(gate.snapshot().active, 0);
    gate.dispose();
    await assert.rejects(gate.run(() => 7), /disposed/);
});

test('disposal rejects queued decodes without poisoning the active permit', async () => {
    const gate = new SpriteLoadGate(1);
    let unblock;
    const slow = gate.run(() => new Promise(resolve => { unblock = resolve; }));
    await Promise.resolve();
    const queued = gate.run(() => 'never');
    assert.equal(gate.snapshot().queued, 1);
    gate.dispose();
    await assert.rejects(queued, /disposed/);
    unblock('complete');
    assert.equal(await slow, 'complete');
    assert.equal(gate.snapshot().active, 0);
});

test('single-flight still shares a decode and LRU evicts without breaking existing pack', async () => {
    const service = new CharacterVisualService({ storage: null, performanceProfile: { tier: 'performance' } });
    const requests = [];
    service.loadPair = async (slug, variant) => {
        requests.push(slug + ':' + variant);
        return pack(slug, variant);
    };
    const [first, same] = await Promise.all([service.loadPack('negar'), service.loadPack('negar')]);
    assert.equal(first, same);
    assert.deepEqual(requests, ['negar:lite']);
    await service.loadPack('darya', 'lite');
    await service.loadPack('setayesh', 'lite');
    assert.equal(service.packCache.size, 2);
    assert.equal(service.memorySnapshot().cacheBytesEstimated, 8 * MiB);
    assert.equal(service.memorySnapshot().loader.highWatermark, 1);
    assert.equal(service.memorySnapshot().evictions, 1);
    assert.equal(await service.loadPack('negar', 'lite'), first === service.packCache.get('negar:lite') ? first : service.packCache.get('negar:lite'));
    service.dispose();
    assert.equal(service.packCache.size, 0);
});

test('scene transition drops only inactive cache references, not live player pack', async () => {
    const listeners = new Map();
    const eventBus = { on(event, fn) {
        listeners.set(event, fn);
        return () => listeners.delete(event);
    } };
    const service = new CharacterVisualService({ storage: null, eventBus });
    service.loadPair = async (slug, variant) => pack(slug, variant);
    service.setActiveSlug('darya');
    const active = await service.loadPack('darya', 'runtime');
    const npc = await service.loadPack('negar', 'lite');
    assert.equal(service.packCache.size, 2);
    listeners.get('game:launched')({ gameId: 'cafe-rush' });
    assert.deepEqual([...service.packCache.keys()], ['darya:runtime']);
    assert.ok(active.image.naturalWidth > 0);
    assert.ok(npc.image.naturalWidth > 0, 'dropping cache reference must not invalidate external consumer');
    service.dispose();
    assert.equal(listeners.size, 0);
});

test('late decode can never resurrect cache entries after dispose', async () => {
    const service = new CharacterVisualService({ storage: null });
    let resolveLoading;
    service.loadPair = () => new Promise(resolve => { resolveLoading = resolve; });
    const loading = service.loadPack('darya', 'runtime');
    await Promise.resolve();
    await Promise.resolve();
    service.dispose();
    resolveLoading(pack('darya', 'runtime'));
    await assert.rejects(loading, /disposed/);
    assert.equal(service.packCache.size, 0);
    assert.equal(service.memorySnapshot().inFlightPairs, 0);
});

test('loadPair aborts real inflight atlas fetch when service is disposed', async () => {
    const originalFetch = globalThis.fetch;
    const service = new CharacterVisualService({ storage: null });
    let started;
    const fetchStarted = new Promise(resolve => { started = resolve; });
    globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
        started();
        signal.addEventListener('abort', () => reject(new Error('aborted by signal')), { once: true });
    });
    try {
        const task = service.loadPack('darya', 'runtime');
        await fetchStarted;
        assert.equal(service.controllers.size, 1);
        service.dispose();
        await assert.rejects(task, /disposed/);
        assert.equal(service.controllers.size, 0);
    } finally {
        globalThis.fetch = originalFetch;
        service.dispose();
    }
});
