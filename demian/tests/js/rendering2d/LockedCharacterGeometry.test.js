import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spriteDrawMetrics } from '../../../resources/js/game/rendering2d/PixelActorRenderer.js';

test('Darya keeps one silhouette and identical body dimensions across motion states', () => {
    const atlas = JSON.parse(readFileSync(new URL('../../../public/assets/characters/darya/darya-atlas-v13-mobile.json', import.meta.url)));
    assert.equal(atlas.render.frameBlend, false);
    const camera = { pixelsPerUnit: 12, worldToScreen: () => ({ x: 100, y: 100 }) };
    const entity = { atlas, position: { x: 0, z: 0 }, visual: {}, bodyRoot: { position: { y: 0 } } };
    const frame = atlas.frames.walk_e_000;
    const standing = spriteDrawMetrics(camera, entity, frame);
    for (const visual of [{ width: 1.4, height: .6, bob: .8, tilt: .4 }, { width: .5, height: 2, y: .8 }]) {
        entity.visual = visual;
        const moving = spriteDrawMetrics(camera, entity, frame);
        assert.equal(moving.frameWidth, standing.frameWidth);
        assert.equal(moving.frameHeight, standing.frameHeight);
        assert.equal(moving.anchorY, standing.anchorY);
        assert.equal(moving.rotation, 0);
    }
    entity.bodyRoot.position.y = 2;
    const jumping = spriteDrawMetrics(camera, entity, atlas.frames.jump_e_000);
    assert.equal(jumping.anchorY, standing.anchorY - 24);
    assert.equal(jumping.frameHeight, standing.frameHeight);
});
