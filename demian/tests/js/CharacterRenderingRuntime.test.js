import assert from 'node:assert/strict';
import test from 'node:test';
import {
    characterRuntimeVariants,
    orderedSpriteVariants,
} from '../../resources/js/game/characters/runtime/CharacterRuntimePolicy.js';
import {
    isDrawableImage,
    spriteDrawMetrics,
} from '../../resources/js/game/rendering2d/PixelActorRenderer.js';

test('Open World never blocks on desktop-size character sheets', () => {
    assert.deepEqual(characterRuntimeVariants({ tier: 'high' }), { active: 'mobile', npc: 'compact' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'performance' }), { active: 'compact', npc: 'compact' });
    assert.deepEqual(orderedSpriteVariants('compact'), ['compact', 'mobile', 'desktop']);
});

test('CanvasTexture images without HTMLImageElement.complete remain drawable', () => {
    assert.equal(isDrawableImage({ width: 48, height: 64 }), true);
    assert.equal(isDrawableImage({ complete: false, width: 48, height: 64 }), false);
    assert.equal(isDrawableImage({ complete: true, naturalWidth: 0, naturalHeight: 0 }), false);
});

test('sprite drawing is foot-pivot anchored, pixel-snapped and respects presentation offsets', () => {
    const camera = {
        pixelsPerUnit: 10,
        worldToScreen: () => ({ x: 100, y: 120 }),
    };
    const entity = {
        group: { position: { x: 0, z: 0 } },
        atlas: {
            pivot: { x: 0.5, y: 0.96 },
            display: { worldHeight: 3.75 },
            render: { referenceBodyHeightRatio: 0.75 },
        },
        visual: { width: 1.1, height: 0.9, bob: 0.2, x: 0.1, y: 0.05, tilt: 0.12 },
        visualHeight: () => 3.75,
    };
    const metrics = spriteDrawMetrics(camera, entity, { x: 0, y: 0, w: 100, h: 100 });

    assert.equal(metrics.pivotX, 0.5);
    assert.equal(metrics.pivotY, 0.96);
    assert.equal(metrics.anchorX, 101);
    assert.equal(metrics.anchorY, 118);
    assert.equal(Number.isInteger(metrics.frameWidth), true);
    assert.equal(Number.isInteger(metrics.frameHeight), true);
    assert.equal(metrics.rotation, 0.12);
    assert.ok(metrics.frameHeight > 40);
});
