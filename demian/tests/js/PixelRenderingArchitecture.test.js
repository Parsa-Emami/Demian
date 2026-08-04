import test from 'node:test';
import assert from 'node:assert/strict';
import PixelCamera2D from '../../resources/js/game/rendering2d/PixelCamera2D.js';
import manifest from '../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';

test('pixel camera world and screen transforms round-trip', () => {
    const camera = new PixelCamera2D({ bounds: manifest.bounds, viewportWidth: 480, viewportHeight: 270, pixelsPerUnit: 10 });
    camera.jumpTo({ x: 2, z: -3 });
    const world = { x: 7.25, z: 4.5 };
    const screen = camera.worldToScreen(world);
    const restored = camera.screenToWorld(screen);
    assert.ok(Math.abs(restored.x - world.x) <= 0.1);
    assert.ok(Math.abs(restored.z - world.z) <= 0.1);
});

test('reference café manifest fills a four by three streaming grid', () => {
    assert.equal(manifest.id, 'demian-reference-cafe');
    assert.equal(manifest.chunks.length, 12);
    assert.equal(manifest.at(0, 0).id, 'cafe-0-0');
    assert.equal(manifest.at(3, 2).id, 'cafe-3-2');
    assert.equal(manifest.serialize().metadata.renderer, 'canvas2d-pixel');
});
