import test from 'node:test';
import assert from 'node:assert/strict';
import CharacterVisualService from '../../../resources/js/game/characters/runtime/CharacterVisualService.js';
import {
    optionalAssetPolicy, isTransientAssetError, withTransientRetry,
} from '../../../resources/js/game/characters/runtime/MobileNetworkPolicy.js';

const pack = (slug, variant) => ({
    slug, variant, image: { naturalWidth: 64, naturalHeight: 64 },
    atlas: { meta: { size: { w: 64, h: 64 }, variant } },
});
const wait = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

test('mobile optional asset policy prioritizes players, honoring Save-Data, 2G, 3G, visibility and offline', () => {
    assert.equal(optionalAssetPolicy({}).deferBackground, false, 'missing Network Information API is safe');
    assert.equal(optionalAssetPolicy({ connection: { effectiveType: '4g' }, online: true, hidden: false }).maxBackgroundNpcs, Infinity);
    assert.equal(optionalAssetPolicy({ connection: { effectiveType: '3g' }, online: true, hidden: false }).maxBackgroundNpcs, 1);
    for (const type of ['2g', 'slow-2g']) {
        assert.equal(optionalAssetPolicy({ connection: { effectiveType: type }, online: true, hidden: false }).maxBackgroundNpcs, 0);
    }
    assert.equal(optionalAssetPolicy({ connection: { saveData: true }, online: true, hidden: false }).reason, 'save-data');
    assert.equal(optionalAssetPolicy({ connection: {}, online: false, hidden: false }).reason, 'offline');
    assert.equal(optionalAssetPolicy({ connection: {}, online: true, hidden: true }).reason, 'hidden');
});

test('transient retry handles 503 once then succeeds; does not retry 404 or corrupt art', async () => {
    const calls = [];
    const result = await withTransientRetry(async attempt => {
        calls.push(attempt);
        if (attempt === 1) throw Object.assign(new Error('busy'), { status: 503 });
        return 'ready';
    }, { baseDelayMs: 0, delay: async () => {} });
    assert.equal(result, 'ready');
    assert.deepEqual(calls, [1, 2]);
    for (const error of [Object.assign(new Error('not found'), { status: 404 }), new Error('Art integrity invalid')]) {
        let attempts = 0;
        await assert.rejects(withTransientRetry(async () => { attempts++; throw error; },
            { delay: async () => {} }), /not found|integrity/i);
        assert.equal(attempts, 1);
    }
    assert.equal(isTransientAssetError(Object.assign(new Error('429'), { status: 429 })), true);
    assert.equal(isTransientAssetError(Object.assign(new Error('timed out'), { code: 'TIMEOUT' })), true);
});

test('abort during retry backoff stops network attempts', async () => {
    const controller = new AbortController();
    let tries = 0;
    await assert.rejects(withTransientRetry(async () => {
        tries++;
        throw Object.assign(new Error('temporary'), { status: 503 });
    }, { signal: controller.signal, baseDelayMs: 1000, onRetry: () => controller.abort() }), /cancelled/);
    assert.equal(tries, 1);
});

test('optional sprite image requests are canceled on navigation and do not trigger fallbacks or cooldowns', async () => {
    const handlers = new Map();
    const eventBus = { on(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); } };
    const service = new CharacterVisualService({ storage: null, eventBus });
    const entered = wait();
    service.loadPair = async (_slug, _variant, { signal }) => {
        entered.resolve();
        return new Promise((_resolve, reject) => signal.addEventListener('abort',
            () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true }));
    };
    try {
        const loading = service.loadPack('negar', 'lite', { background: true });
        await entered.promise;
        assert.equal(service.memorySnapshot().optionalInFlight, 1);
        handlers.get('game:loading')({ gameId: 'cafe-rush' });
        await assert.rejects(loading, /cancelled/);
        assert.equal(service.packCache.size, 0);
        assert.equal(service.failedPairs.size, 0);
        assert.equal(service.memorySnapshot().backgroundCancelled, 1);
    } finally {
        service.dispose();
        assert.equal(handlers.size, 0);
    }
});

test('foreground request joining same NPC in-flight sprite protects it from background cancellation', async () => {
    const service = new CharacterVisualService({ storage: null });
    const entered = wait(), finish = wait();
    let count = 0;
    service.loadPair = async (slug, variant) => {
        count++;
        entered.resolve();
        await finish.promise;
        return pack(slug, variant);
    };
    try {
        const background = service.loadPack('darya', 'lite', { background: true });
        await entered.promise;
        const foreground = service.loadPack('darya', 'lite');
        assert.equal(service.cancelBackgroundLoads(), 0);
        finish.resolve();
        const [one, two] = await Promise.all([background, foreground]);
        assert.equal(one, two);
        assert.equal(count, 1);
        assert.equal(service.memorySnapshot().backgroundCancelled, 0);
    } finally { service.dispose(); }
});

test('retries transient sprite errors without downloading other variants and never retries bad files', async () => {
    const service = new CharacterVisualService({ storage: null });
    const calls = [];
    service.loadPair = async (slug, variant) => {
        calls.push(variant);
        if (calls.length === 1) throw Object.assign(new Error('HTTP 503'), { status: 503 });
        return pack(slug, variant);
    };
    try {
        const result = await service.loadPack('tiam', 'runtime');
        assert.equal(result.variant, 'runtime');
        assert.deepEqual(calls, ['runtime', 'runtime']);
        assert.equal(service.memorySnapshot().transientRetries, 1);
        service.failedPairs.set('tiam:runtime', { error: Object.assign(new Error('temporary'), { status: 503 }), retryAfter: Date.now() + 30000 });
        service.failedPairs.set('darya:lite', { error: Object.assign(new Error('missing'), { status: 404 }), retryAfter: Date.now() + 30000 });
        service.clearTransientFailures();
        assert.equal(service.failedPairs.has('tiam:runtime'), false);
        assert.equal(service.failedPairs.has('darya:lite'), true);
    } finally { service.dispose(); }
});

test('critical foreground load works even when browser reports offline', async () => {
    const service = new CharacterVisualService({ storage: null });
    service.loadPair = async (slug, variant) => pack(slug, variant);
    try {
        const result = await service.loadPack('darya', 'runtime');
        assert.equal(result.variant, 'runtime');
    } finally { service.dispose(); }
});
