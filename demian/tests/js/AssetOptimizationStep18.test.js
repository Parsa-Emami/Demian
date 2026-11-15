import test from 'node:test';
import assert from 'node:assert/strict';
import { assetDecision } from '../../tools/release_asset_policy.mjs';
import CharacterVisualService from '../../resources/js/game/characters/runtime/CharacterVisualService.js';

function runAssetPairTest(image, revision = 'a'.repeat(64)) {
    const originalFetch = globalThis.fetch;
    const service = new CharacterVisualService({ storage: null });
    const loaded = [];
    service.loadImage = async url => {
        loaded.push(url);
        return { naturalWidth: 1536, naturalHeight: 1920 };
    };
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ meta: { image, imageRevision: revision,
            size: { w: 1536, h: 1920 } } }),
    });
    return {
        loaded, service,
        async go() {
            try { return await service.loadPair('darya', 'runtime'); }
            finally { globalThis.fetch = originalFetch; service.dispose(); }
        },
    };
}

test('Step 18: release policy accepts only declared runtime/detail WebP alongside original source PNG', () => {
    for (const variant of ['lite', 'runtime', 'detail']) {
        for (const ext of ['png', 'webp']) {
            assert.equal(assetDecision('characters/darya/darya-spritesheet-v14-' + variant + '.' + ext).keep, true);
        }
    }
    assert.equal(assetDecision('characters/darya/darya-spritesheet-v14-lite.webp').keep, true);
    assert.equal(assetDecision('characters/darya/darya-spritesheet-v14-mobile.webp').keep, false);
    assert.equal(assetDecision('characters/darya/darya-spritesheet-v14-desktop.webp').keep, false);
    assert.equal(assetDecision('characters/darya/darya-spritesheet-v13-runtime.webp').keep, false);
    assert.equal(assetDecision('characters/darya/source-v14/master.png').keep, false);
    assert.equal(assetDecision('characters/darya/darya-atlas-v14-runtime.webp').keep, false);
});

test('Step 18: runtime honors only pixel-exact atlas WebP sibling and retains revision cache key', async () => {
    const h = runAssetPairTest('darya-spritesheet-v14-runtime.webp');
    const pack = await h.go();
    assert.match(h.loaded[0], /darya-spritesheet-v14-runtime\.webp\?sprite_rev=a{64}$/i);
    assert.equal(pack.variant, 'runtime');
    assert.equal(pack.atlas.meta.image, 'darya-spritesheet-v14-runtime.webp');
});

test('Step 18: unoptimized PNG release and Laravel development continue to use original image', async () => {
    const h = runAssetPairTest('darya-spritesheet-v14-runtime.png');
    const pack = await h.go();
    assert.match(h.loaded[0], /darya-spritesheet-v14-runtime\.png\?sprite_rev=a{64}$/i);
    assert.equal(pack.variant, 'runtime');
});

test('Step 18: atlas metadata cannot redirect sprite fetches or cross-link characters', async () => {
    for (const attack of [
        '../negar/negar-spritesheet-v14-runtime.webp',
        'https://other.example.com/tracking.webp',
        'darya-spritesheet-v14-mobile.webp',
        'darya-spritesheet-v14-runtime.svg',
    ]) {
        const h = runAssetPairTest(attack);
        await assert.rejects(h.go(), /Atlas sprite path mismatch/);
        assert.equal(h.loaded.length, 0);
    }
});

test('Step 18: Save-Data and 2G never fetch the high-resolution player variant first', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const service = new CharacterVisualService({ storage: null,
        performanceProfile: { tier: 'high' } });
    const loaded = [];
    service.loadPair = async (slug, variant) => {
        loaded.push(variant);
        return { slug, variant, image: { naturalWidth: 512, naturalHeight: 512 },
            atlas: { meta: { size: { w: 512, h: 512 } } } };
    };
    try {
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true, value: { onLine: true,
                connection: { saveData: true, effectiveType: '4g' } },
        });
        const saved = await service.loadPack('darya', 'detail');
        assert.equal(saved.variant, 'lite');
        assert.deepEqual(loaded, ['lite']);
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true, value: { onLine: true,
                connection: { saveData: false, effectiveType: 'slow-2g' } },
        });
        const slow = await service.loadPack('negar', 'detail');
        assert.equal(slow.variant, 'lite');
        assert.deepEqual(loaded, ['lite', 'lite']);
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true, value: { onLine: true,
                connection: { saveData: false, effectiveType: '4g' } },
        });
        const fast = await service.loadPack('hanna', 'detail');
        assert.equal(fast.variant, 'detail');
        assert.equal(loaded[2], 'detail');
    } finally {
        service.dispose();
        if (previous) Object.defineProperty(globalThis, 'navigator', previous);
        else delete globalThis.navigator;
    }
});

test('Step 18: long-running character churn stays within strong-reference budget and cleanup removes all owners', async () => {
    const events = new Map();
    const service = new CharacterVisualService({
        storage: null, performanceProfile: { tier: 'performance' },
        eventBus: { on(event, fn) { events.set(event, fn); return () => events.delete(event); } },
    });
    service.loadPair = async (slug, variant) => ({
        slug, variant, image: { naturalWidth: 1024, naturalHeight: 1024 },
        atlas: { meta: { size: { w: 1024, h: 1024 } } },
    });
    const roster = ['darya', 'negar', 'hanna', 'tiam', 'arsal', 'amin'];
    try {
        for (let i = 0; i < 180; i++) {
            service.setActiveSlug(roster[i % roster.length]);
            await service.loadPack(roster[i % roster.length], 'lite');
            await service.loadPack(roster[(i + 1) % roster.length], 'lite');
            if (i % 3 === 0) events.get('game:launched')({ gameId: 'cafe-critters' });
            const snapshot = service.memorySnapshot();
            assert.ok(snapshot.cacheBytesEstimated <= snapshot.cacheBudgetBytes);
            assert.equal(snapshot.loader.active, 0);
            assert.equal(snapshot.loader.queued, 0);
        }
    } finally {
        service.dispose();
    }
    assert.equal(service.memorySnapshot().cacheBytesEstimated, 0);
    assert.equal(service.memorySnapshot().cacheEntries, 0);
    assert.equal(service.memorySnapshot().pendingControllers, 0);
    assert.equal(events.size, 0);
});
