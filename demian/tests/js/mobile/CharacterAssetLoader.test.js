import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import CharacterAssetLoader from '../../../resources/js/game/characters/runtime/CharacterAssetLoader.js';

test('entities share decoded art but own independent disposable texture views', async () => {
    const image = { width: 128, height: 128 };
    const loader = new CharacterAssetLoader({ visualService: { loadPack: async () => ({
        image, atlas: {}, variant: 'lite', spriteUrl: '/art.webp', atlasUrl: '/art.json',
    }) } });
    const first = await loader.loadCharacterAssets({ slug: 'darya' });
    const second = await loader.loadCharacterAssets({ slug: 'darya' });
    assert.notEqual(first.texture, second.texture);
    assert.equal(first.texture.image, second.texture.image);
    assert.equal(first.texture.magFilter, THREE.NearestFilter);
    first.texture.dispose();
    assert.equal(second.texture.image, image);
    loader.dispose();
});

test('atlas integrity failure stops before decoding a sprite', async () => {
    let requests = 0;
    const loader = new CharacterAssetLoader({ fetcher: async () => ({ ok: true, json: async () => ({ meta: { artIntegrity: 'invalid' } }) }),
        textureLoader: { load: () => requests++ } });
    await assert.rejects(loader.loadAssetPair({ atlasUrl: 'https://example.test/art.json', spriteUrl: '/art.png' }), /integrity/);
    assert.equal(requests, 0);
});

test('a late texture callback after timeout disposes its unused GPU resource', async () => {
    let deliver, disposed = 0;
    const loader = new CharacterAssetLoader({ timeoutMs: 5, textureLoader: { load: (_, success) => { deliver = success; } } });
    await assert.rejects(loader.loadTexture('/slow.png'), /timed out/);
    deliver({ dispose: () => disposed++ });
    assert.equal(disposed, 1);
});
