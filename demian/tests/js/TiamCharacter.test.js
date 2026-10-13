import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import CharacterRepository from '../../resources/js/game/data/CharacterRepository.js';
import { builtinCharacterAssetPair, isRetiredCharacter } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { CHARACTER_LOCOMOTION_STATES } from '../../resources/js/game/characters/CharacterMotionProfile.js';

const assetRoot = resolve(import.meta.dirname, '../../public/assets/characters/tiam');
const readAtlas = (variant) => JSON.parse(readFileSync(resolve(assetRoot, `tiam-atlas-v14-${variant}.json`), 'utf8'));

test('Tiam resolves real V14 files on every device with a shoulder companion and valid motion states', () => {
    assert.equal(isRetiredCharacter('tiam'), false);
    assert.equal(isRetiredCharacter('ronak'), true);
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite']) {
        const atlas = readAtlas(variant);
        const pair = builtinCharacterAssetPair('tiam', variant, 'https://example.test/Demian/');
        assert.ok(pair.spriteUrl.endsWith(atlas.meta.image));
        assert.equal(readFileSync(resolve(assetRoot, atlas.meta.image)).subarray(1, 4).toString(), 'PNG');
        assert.equal(atlas.companion.id, 'homayoun');
        assert.equal(atlas.companion.anchor, 'shoulder');
        assert.equal(atlas.companion.bakedIntoEveryFrame, true);
        assert.equal(atlas.companion.collisionIndependent, true);
        const animator = new FrameAnimator(atlas);
        for (const state of [...CHARACTER_LOCOMOTION_STATES, 'crouch', 'wave', 'win', 'celebrate']) {
            animator.play(state, { restart: true });
            if (state !== 'idle') assert.notEqual(animator.animationName, 'idle', `${state} needs its own motion or explicit alias`);
            for (const direction of atlas.meta.directions) {
                animator.setDirection(direction);
                animator.update(1 / 60);
                assert.ok(atlas.frames[animator.currentFrameName()], `${variant}/${state}/${direction}`);
            }
        }
        assert.notDeepEqual(atlas.animations.slide.frames, atlas.animations.run.frames);
        assert.notDeepEqual(atlas.animations.land.frames, atlas.animations.jump.frames);
    }
});

test('the real canvas avatar switches Tiam through run, slide, takeoff and fall without changing her identity', () => {
    const atlas = readAtlas('runtime');
    const avatar = new CanvasCharacterAvatar({ slug: 'tiam', atlas, image: {}, player: true });
    const actor = { position: { x: 0, z: 0 }, forward: { x: 1, z: 0 }, speed: 5 };
    avatar.sync(actor, 1 / 60); assert.equal(avatar.state, 'run');
    avatar.sync({ ...actor, motionState: 'slide' }, 1 / 60); assert.equal(avatar.state, 'slide');
    avatar.sync({ ...actor, airborne: true, jumpVelocity: 4 }, 1 / 60); assert.equal(avatar.state, 'takeoff');
    avatar.sync({ ...actor, airborne: true, jumpVelocity: -4 }, 1 / 60); assert.equal(avatar.state, 'fall');
    assert.equal(avatar.slug, 'tiam');
    assert.equal(avatar.atlas.companion.id, 'homayoun');
});

test('character API client retains Tiam and continues filtering retired Ronak', async (t) => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [
        { id: 11, slug: 'tiam' }, { id: 12, slug: 'ronak' }, { id: 13, slug: 'darya' },
    ] }) });
    t.after(() => { globalThis.fetch = original; });
    const repository = new CharacterRepository({ baseUrl: 'https://example.test/characters' });
    assert.deepEqual((await repository.list()).map(c => c.slug), ['tiam', 'darya']);
});
