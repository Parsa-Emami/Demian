import test from 'node:test';
import assert from 'node:assert/strict';
import StaticSceneCache from '../../../resources/js/game/rendering2d/StaticSceneCache.js';
import PixelCamera2D from '../../../resources/js/game/rendering2d/PixelCamera2D.js';

test('static scene draws once, survives camera movement, and rebuilds at cache edges and atmosphere changes', () => {
    let paints = 0, copies = 0;
    const canvas = { width: 0, height: 0, getContext: () => ({}) };
    const cache = new StaticSceneCache(() => { paints++; }, { canvasFactory: () => canvas });
    const camera = new PixelCamera2D({ viewportWidth: 390, viewportHeight: 844, pixelsPerUnit: 24 });
    const ctx = { drawImage: () => { copies++; } };
    for (let i = 0; i < 60; i++) cache.draw(ctx, camera);
    assert.equal(paints, 1); assert.equal(copies, 60);
    camera.position.x += 1; cache.draw(ctx, camera); assert.equal(paints, 1);
    camera.position.x += 5; cache.draw(ctx, camera); assert.equal(paints, 2);
    cache.draw(ctx, camera, 'night'); assert.equal(paints, 3);
    camera.pixelsPerUnit = 12; cache.draw(ctx, camera, 'night'); assert.equal(paints, 4);
    assert.ok(cache.stats().bytes <= 8800000);
    cache.dispose(); assert.equal(cache.stats().bytes, 0); assert.equal(canvas.width, 1);
});

test('static scene memory remains bounded at the maximum renderer viewport', () => {
    const canvas = { width: 0, height: 0, getContext: () => ({}) };
    const cache = new StaticSceneCache(() => {}, { canvasFactory: () => canvas });
    cache.draw({ drawImage() {} }, new PixelCamera2D({ viewportWidth: 1250, viewportHeight: 1000 }));
    assert.ok(cache.stats().bytes <= 8800000);
});
