import test from 'node:test';
import assert from 'node:assert/strict';
import CharacterVisualService from '../../resources/js/game/characters/runtime/CharacterVisualService.js';

test('concurrent character requests share one decode; a failed runtime pack falls back as a matching lite pair', async () => {
    const service = new CharacterVisualService({ storage: null });
    const requests = [];
    service.loadPair = async (slug, variant) => {
        requests.push([slug, variant]);
        if (variant === 'runtime') throw new Error('missing runtime PNG');
        return { slug, variant, image: { width: 1024, height: 832 }, atlas: { meta: { variant } } };
    };
    const [first, second] = await Promise.all([service.loadPack('negar'), service.loadPack('negar')]);
    assert.equal(first, second); assert.equal(first.variant, 'lite');
    assert.deepEqual(requests, [['negar', 'runtime'], ['negar', 'lite']]);
    assert.equal(await service.loadPack('negar'), first);
    assert.equal(requests.length, 2, 'unavailable runtime packs are not requested repeatedly during hydration');
    assert.equal(service.packPromises.size, 0);
    service.dispose(); assert.equal(service.packCache.size, 0);
});

test('a timeout that already fired rejects immediately rather than leaving the image promise hanging', async () => {
    const original = globalThis.Image;
    globalThis.Image = class { set src(value) { this.url = value; } };
    try {
        const controller = new AbortController(); controller.abort();
        const service = new CharacterVisualService({ storage: null });
        await assert.rejects(service.loadImage('broken.png', controller.signal), /aborted/);
    } finally { globalThis.Image = original; }
});
