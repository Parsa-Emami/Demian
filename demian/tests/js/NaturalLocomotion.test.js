import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { characterPlaybackRate } from '../../resources/js/game/characters/CharacterMotionProfile.js';

function atlas(slug, variant = 'runtime') {
    return JSON.parse(readFileSync(resolve(import.meta.dirname,
        `../../public/assets/characters/${slug}/${slug}-atlas-v14-${variant}.json`), 'utf8'));
}

test('every shipped character has the same bounded stride cadence at equal speeds, including Tiam', () => {
    for (const state of ['walk', 'run', 'sprint']) {
        for (const ratio of [0.3, 0.9, 1.2]) {
            let reference;
            for (const slug of BUILTIN_CHARACTER_SLUGS) {
                const animation = atlas(slug).animations[state];
                const rate = characterPlaybackRate(state, ratio, animation);
                const strides = animation.cycleCount * animation.fps * rate / animation.frames.length;
                reference ??= strides;
                assert.ok(Math.abs(strides - reference) < 1e-10, `${slug}/${state}`);
                assert.ok(strides < 1.7, 'No fast limb flutter at maximum running speed');
            }
        }
    }
    const run = atlas('tiam').animations.run;
    assert.equal(run.cycleCount, 2);
    assert.ok(characterPlaybackRate('run', 1, run) < .55);
});

test('authored arms and legs keep advancing during rise, apex and fall on every character and device', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) for (const variant of ['runtime', 'lite', 'mobile']) {
        const data = atlas(slug, variant);
        const avatar = new CanvasCharacterAvatar({ slug, atlas: data, image: {} });
        const actor = { position: {x:0,z:0}, speed: 5, forward: {x:1,z:0}, airborne: true, jumpForce: 6.5 };
        const states = new Set(), rectangles = new Map();
        let previousSource = 0;
        for (let i = 0; i <= 120; i++) {
            avatar.sync({ ...actor, jumpVelocity: 6.5 * (1 - i / 60) }, 1 / 60);
            states.add(avatar.state);
            const name = avatar.animator.currentFrameName();
            const source = Number(name.split('_').at(-1));
            assert.ok(source >= previousSource, 'Jump poses must not restart at phase transitions');
            previousSource = source;
            const f = data.frames[name];
            const set = rectangles.get(avatar.state) ?? new Set();
            set.add(`${f.x}:${f.y}`); rectangles.set(avatar.state, set);
        }
        assert.deepEqual([...states], ['takeoff', 'jump', 'fall']);
        for (const state of states) assert.ok(rectangles.get(state).size >= 3, `${slug}/${variant}/${state} froze`);
        assert.ok(previousSource < 47, 'Standing recovery belongs to landing, not airborne descent');
        assert.deepEqual(avatar.visual, {width:1,height:1,bob:0,tilt:0,x:0,y:0});
    }
});

test('changing between one-stride walking and two-stride running preserves the supporting foot', () => {
    const animator = new FrameAnimator(atlas('tiam'));
    animator.play('walk'); animator.update(.23);
    const phase = (animator.frameIndex + animator.frameProgress()) / animator.currentFrames().length;
    animator.play('run', {preservePhase:true});
    animator.setPlaybackRate(characterPlaybackRate('run', 1, animator.animation));
    const running = (animator.frameIndex + animator.frameProgress()) / animator.currentFrames().length * 2;
    assert.ok(Math.abs(phase - running) < 1e-10);
    animator.play('walk', {preservePhase:true});
    const walking = (animator.frameIndex + animator.frameProgress()) / animator.currentFrames().length;
    assert.ok(Math.abs(phase - walking) < 1e-10);
});

test('physics sampling resumes from a held endpoint and supports reverse directions', () => {
    const animator = new FrameAnimator(atlas('setayesh'));
    animator.play('takeoff'); animator.seek(1); assert.equal(animator.finished, true);
    animator.seek(.35); assert.equal(animator.finished, false);
    animator.setDirection('w'); assert.match(animator.currentFrameName(), /^jump_w_/);
    assert.ok(animator.frameProgress() > 0);
});
