import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { characterPackVersion } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';

const root = new URL('../../public/assets/characters/arsal/', import.meta.url);
const read = (variant, version = 15) =>
    JSON.parse(readFileSync(new URL(`arsal-atlas-v${version}-${variant}.json`, root), 'utf8'));

test('Arsal and Darya resolve through V15 independently of the V14 roster', () => {
    assert.equal(characterPackVersion('arsal'), 15);
    assert.equal(characterPackVersion('darya'), 15);
    assert.equal(characterPackVersion('sadro'), 14);
});

test('world walk/run in Arsal V15 keeps the supporting-step phase through direction and quality changes', () => {
    const avatar = new CanvasCharacterAvatar({ slug: 'arsal', atlas: read('lite'), image: {} });
    const actor = { speed: 3.55, grounded: true, forward: { x: -1, z: -1 }, motionState: 'walk' };
    avatar.sync(actor, .1);
    assert.match(avatar.animator.currentFrameName(), /^world_nw_walk-/);
    const phase = avatar.animator.locomotionPhase;
    avatar.sync({ ...actor, forward: { x: 1, z: -1 }, motionState: 'run', travelledDistance: 0 }, 0);
    assert.match(avatar.animator.currentFrameName(), /^world_ne_run-/);
    assert.equal(avatar.animator.locomotionPhase, phase);
    const name = avatar.animator.currentFrameName();
    avatar.replaceVisualAssets({}, read('detail'));
    assert.equal(avatar.animator.currentFrameName(), name);
    assert.equal(avatar.animator.locomotionPhase, phase);
});

test('Dino Run selects the side-view slide and keeps the pose through quality hydration', () => {
    const avatar = new CanvasCharacterAvatar({ slug: 'arsal', atlas: read('lite'), image: {}, sideView: true });
    const actor = { speed: 6.9, grounded: true, forward: { x: -1, z: 0 }, motionState: 'slide' };
    avatar.sync(actor, .2);
    assert.match(avatar.animator.currentFrameName(), /^side_slide_w_/);
    const name = avatar.animator.currentFrameName();
    avatar.replaceVisualAssets({}, read('runtime'));
    assert.equal(avatar.animator.currentFrameName(), name);
    avatar.sync({ ...actor, forward: { x: 1, z: 0 } }, 0);
    assert.match(avatar.animator.currentFrameName(), /^side_slide_e_/);
    avatar.replaceVisualAssets({}, read('runtime', 14));
    assert.match(avatar.animator.currentFrameName(), /^slide_e_/);
});

test('Arsal V15 skid advances into the final idle pose when feet stop travelling', () => {
    const animator = new FrameAnimator(read('lite'));
    animator.setDirection('n');
    animator.play('skid');
    advanceCharacterAnimation(animator, { state: 'skid', deltaTime: .25, movementSpeed: 0, travelledDistance: 0 });
    advanceCharacterAnimation(animator, { state: 'skid', deltaTime: .25, movementSpeed: 0, travelledDistance: 0 });
    assert.equal(animator.currentFrameName(), 'world_n_idle');
    assert.equal(animator.finished, true);
});
