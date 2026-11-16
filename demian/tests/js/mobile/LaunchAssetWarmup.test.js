import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalSpriteSlug, criticalSpriteVariant, prewarmCriticalGameSprite }
    from '../../../resources/js/game/performance/GameAssetWarmup.js';
import { SpriteLoadGate } from '../../../resources/js/game/characters/runtime/SpriteMemoryPolicy.js';
import CharacterVisualService from '../../../resources/js/game/characters/runtime/CharacterVisualService.js';

const normal = () => ({ reason: 'normal' });

test('prewarm only the required player art, never staff, map tiles or score APIs', async () => {
    const calls = [];
    const visuals = {
        activeSlug: 'negar',
        runtimeVariant: () => 'lite',
        loadPack: async (...args) => { calls.push(args); return {}; },
    };
    assert.equal(criticalSpriteSlug('open-world', visuals), 'negar');
    assert.equal(criticalSpriteSlug('dino-run', visuals), 'negar');
    assert.equal(criticalSpriteSlug('after-hours', visuals), 'darya');
    assert.equal(criticalSpriteSlug('cafe-rush', visuals), 'amirreza');
    assert.equal(criticalSpriteSlug('coffee-crash', visuals), null);
    assert.equal(await prewarmCriticalGameSprite('open-world', visuals, { networkPolicy: normal }), true);
    assert.equal(await prewarmCriticalGameSprite('cafe-rush', visuals, { networkPolicy: normal }), true);
    assert.deepEqual(calls, [
        ['negar', 'lite', { background: true, speculative: true }],
        ['amirreza', 'lite', { background: true, speculative: true }],
    ]);
});

test('do not waste bandwidth on save-data, 2G, 3G, hidden or offline', async () => {
    let calls = 0;
    const visuals = { activeSlug: 'darya', runtimeVariant: () => 'lite',
        loadPack: () => { calls++; return Promise.resolve({}); } };
    for (const reason of ['save-data', 'slow-network', 'limited-3g', 'hidden', 'offline']) {
        assert.equal(await prewarmCriticalGameSprite('open-world', visuals,
            { networkPolicy: () => ({ reason }) }), false);
    }
    assert.equal(await prewarmCriticalGameSprite('cafe-critters', visuals,
        { networkPolicy: normal }), false);
    assert.equal(calls, 0);
});

test('speculative load failure is invisible to the player and explicit launch can retry', async () => {
    const visuals = { activeSlug: 'darya', runtimeVariant: () => 'lite',
        loadPack: () => Promise.reject(new Error('network unavailable')) };
    assert.equal(await prewarmCriticalGameSprite('open-world', visuals, { networkPolicy: normal }), false);
});

test('foreground sprite beats queued background work without violating the concurrency budget', async () => {
    const gate = new SpriteLoadGate(1);
    const order = [];
    let releaseFirst;
    const first = gate.run(() => new Promise(resolve => { releaseFirst = resolve; }));
    await Promise.resolve();
    const background = gate.run(() => { order.push('background'); return 'background'; },
        { priority: 0 });
    const foreground = gate.run(() => { order.push('foreground'); return 'foreground'; },
        { priority: 1 });
    await Promise.resolve();
    assert.equal(gate.snapshot().queued, 2);
    releaseFirst('first');
    assert.deepEqual(await Promise.all([first, foreground, background]),
        ['first', 'foreground', 'background']);
    assert.deepEqual(order, ['foreground', 'background']);
    assert.equal(gate.snapshot().active, 0);
    gate.dispose();
});

test('a queued speculative sprite is promoted when the same player requests it', async () => {
    const gate = new SpriteLoadGate(1);
    const order = [];
    let releaseFirst, promoted = false;
    const first = gate.run(() => new Promise(resolve => { releaseFirst = resolve; }));
    await Promise.resolve();
    const background = gate.run(() => { order.push('background'); return 'background'; });
    const pendingPlayer = gate.run(() => { order.push('player'); return 'player'; },
        { priority: () => promoted ? 1 : 0 });
    await Promise.resolve();
    promoted = true;
    releaseFirst('done');
    await Promise.all([first, pendingPlayer, background]);
    assert.deepEqual(order, ['player', 'background']);
    gate.dispose();
});

test('failed speculative preload attempts one variant, does not poison real player launch', async () => {
    const service = new CharacterVisualService({ storage: null });
    const attempts = [];
    service.loadPair = async (slug, variant) => {
        attempts.push(variant);
        throw new Error('missing sprite');
    };
    await assert.rejects(
        service.loadPack('darya', 'runtime', { background: true, speculative: true }),
        /missing sprite/
    );
    assert.deepEqual(attempts, ['runtime'], 'never cascade into fallback packs');
    assert.equal(service.failedPairs.size, 0, 'failed menu hint must not install cooldown');

    service.loadPair = async (slug, variant) => {
        attempts.push(variant);
        return { slug, variant, image: { naturalWidth: 64, naturalHeight: 64 },
            atlas: { meta: { size: { w: 64, h: 64 } } } };
    };
    const pack = await service.loadPack('darya', 'runtime');
    assert.equal(pack.variant, 'runtime');
    assert.deepEqual(attempts, ['runtime', 'runtime'], 'explicit player retries same variant');
    service.dispose();
});

test('foreground launch promotes in-flight speculative sprite before cancelling optional loads', async () => {
    const service = new CharacterVisualService({ storage: null });
    let started;
    const hasStarted = new Promise(resolve => { started = resolve; });
    let finish;
    let count = 0;
    service.loadPair = (_slug, _variant) => {
        count++;
        started();
        return new Promise(resolve => { finish = resolve; });
    };
    const warmup = service.loadPack('darya', 'lite',
        { background: true, speculative: true });
    await hasStarted;
    const foreground = service.loadPack('darya', 'lite', { background: false });
    assert.equal(service.cancelBackgroundLoads(), 0,
        'joined critical sprite must not be aborted by game:loading');
    finish({ slug: 'darya', variant: 'lite',
        image: { naturalWidth: 128, naturalHeight: 128 },
        atlas: { meta: { size: { w: 128, h: 128 } } } });
    const [speculativePack, activePack] = await Promise.all([warmup, foreground]);
    assert.equal(speculativePack, activePack);
    assert.equal(count, 1, 'foreground must share the same atlas+decode');
    assert.equal(service.failedPairs.size, 0);
    service.dispose();
});

test('high-end Open World prewarms only lite while Dino Run preserves requested quality', async () => {
    const calls = [];
    const visuals = { activeSlug: 'negar', runtimeVariant: () => 'detail',
        loadPack: async (...args) => { calls.push(args); return {}; } };
    assert.equal(criticalSpriteVariant('open-world', visuals), 'lite');
    assert.equal(criticalSpriteVariant('dino-run', visuals), 'detail');
    assert.equal(await prewarmCriticalGameSprite('open-world', visuals, { networkPolicy: normal }), true);
    assert.deepEqual(calls, [['negar', 'lite', { background: true, speculative: true }]]);
});
