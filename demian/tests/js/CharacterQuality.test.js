import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { captureCharacterStep, characterRenderPose } from '../../resources/js/game/characters/CharacterRenderState.js';
import { BUILTIN_CHARACTER_SLUGS, builtinCharacterAssetPair } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { characterRuntimeVariants, orderedSpriteVariants } from '../../resources/js/game/characters/runtime/CharacterRuntimePolicy.js';
import PixelCamera2D from '../../resources/js/game/rendering2d/PixelCamera2D.js';
import StaticSceneCache from '../../resources/js/game/rendering2d/StaticSceneCache.js';
import { spriteDrawMetrics } from '../../resources/js/game/rendering2d/PixelActorRenderer.js';

const root = new URL('../../public/assets/characters/', import.meta.url);
const readAtlas = (slug, variant) => JSON.parse(readFileSync(new URL(`${slug}/${slug}-atlas-v14-${variant}.json`, root)));

test('detail packs retain every locomotion pose with bounded memory and exact image revisions', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const detail = readAtlas(slug, 'detail'), source = readAtlas(slug, 'desktop');
        assert.equal(detail.meta.frameSize.w, 128);
        assert.ok(detail.meta.decodedBytes <= 34 * 1024 ** 2);
        assert.ok(Math.max(detail.meta.size.w, detail.meta.size.h) <= 4096);
        assert.deepEqual(detail.animations, source.animations);
        for (const state of ['walk', 'run', 'takeoff', 'jump', 'fall']) {
            const frames = detail.animations[state].frames;
            const physical = new Set(frames.map(name => `${detail.frames[name].x}:${detail.frames[name].y}`));
            assert.equal(physical.size, new Set(frames).size, `${slug}/${state} must retain every pose`);
        }
        const image = readFileSync(new URL(`${slug}/${detail.meta.image}`, root));
        assert.equal(createHash('sha256').update(image).digest('hex'), detail.meta.imageRevision);
        assert.equal(detail.render.frameBlend, false);
        assert.equal(detail.render.lockBodyScale, true);
        assert.match(builtinCharacterAssetPair(slug, 'detail').atlasUrl, /-detail\.json$/);
    }
});

test('detail selection has a matching fallback and constrained devices stay on their small sheets', () => {
    assert.deepEqual(characterRuntimeVariants({ tier: 'high' }), { active: 'detail', npc: 'lite' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'balanced' }), { active: 'runtime', npc: 'lite' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'performance' }), { active: 'lite', npc: 'lite' });
    assert.deepEqual(orderedSpriteVariants('detail'), ['detail', 'runtime', 'lite', 'compact', 'mobile']);
    assert.ok(!orderedSpriteVariants('lite').includes('detail'));
});

test('render positions and jump heights interpolate without modifying collision state or bridging teleports', () => {
    const entity = { group: { position: { x: 1, z: 2 } }, bodyRoot: { position: { y: .4 } } };
    captureCharacterStep(entity);
    Object.assign(entity.group.position, { x: 1.2, z: 2.4 }); entity.bodyRoot.position.y = .6;
    assert.deepEqual(characterRenderPose(entity, .5), { x: 1.1, z: 2.2, jumpHeight: .5 });
    assert.deepEqual(entity.group.position, { x: 1.2, z: 2.4 });
    entity.group.position.x = 30;
    assert.equal(characterRenderPose(entity, .25).x, 30);
    assert.equal(characterRenderPose(entity, NaN).x, 30);
});

test('frame sampling interpolates across a loop seam and snaps to a new clip without ghost poses', () => {
    const animator = new FrameAnimator({ animations: {
        run: { frames: ['r0', 'r1', 'r2', 'r3'], fps: 8, loop: true },
        land: { frames: ['l0', 'l1', 'l2'], fps: 8, loop: false },
    } });
    animator.play('run'); animator.seekLoop(.875); animator.captureStep(); animator.update(.125);
    assert.equal(animator.sample(0).frameName, 'r3'); assert.equal(animator.sample(.75).frameName, 'r0');
    const before = { index: animator.frameIndex, elapsed: animator.elapsed };
    animator.sample(.3);
    assert.deepEqual({ index: animator.frameIndex, elapsed: animator.elapsed }, before);
    animator.play('land'); assert.equal(animator.sample(0).frameName, 'l0');
    animator.captureStep(); animator.seek(1); assert.equal(animator.sample(1).frameName, 'l2');
});

test('smooth cameras preserve fractional feet and scene cache motion while pixel cameras retain their grid', () => {
    const smooth = new PixelCamera2D({ pixelSnap: false, pixelsPerUnit: 12 });
    const pixel = new PixelCamera2D({ pixelsPerUnit: 12 });
    assert.notEqual(smooth.worldToScreen({ x: .02, z: .03 }).x, pixel.worldToScreen({ x: .02, z: .03 }).x);
    const entity = { position: { x: .02, z: .03 }, atlas: { render: { lockBodyScale: true } } };
    assert.equal(Number.isInteger(spriteDrawMetrics(smooth, entity, { w: 128, h: 128 }).anchorX), false);
    const calls = [], canvas = { width: 0, height: 0, getContext: () => ({}) };
    const cache = new StaticSceneCache(() => {}, { canvasFactory: () => canvas });
    const ctx = { drawImage: (...args) => calls.push(args) };
    cache.draw(ctx, smooth); smooth.position.x += .023; cache.draw(ctx, smooth);
    assert.equal(cache.stats().builds, 1); assert.equal(Number.isInteger(calls[1][1]), false); cache.dispose();
    const large = new PixelCamera2D({ pixelSnap: false, viewportWidth: 1876, viewportHeight: 1172 });
    const padded = new StaticSceneCache(() => {}, { canvasFactory: () => canvas, maxPixels: 3200000 });
    padded.draw(ctx, large); large.position.x += .03; padded.draw(ctx, large);
    assert.equal(padded.stats().builds, 1); assert.ok(padded.stats().bytes <= 3200000 * 4); padded.dispose();
});
