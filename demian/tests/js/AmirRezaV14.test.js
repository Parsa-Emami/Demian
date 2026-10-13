import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { characterManifestEntry, isProductionReady } from '../../resources/js/game/characters/manifests/CharacterManifestRegistry.js';
import { characterPlaybackRate } from '../../resources/js/game/characters/CharacterMotionProfile.js';

const read = (path) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/assets/characters', path), 'utf8'));
const atlas = (slug, variant) => read(`${slug}/${slug}-atlas-v14-${variant}.json`);

test('AmirReza is a shipped wing-assisted character with the same shared physics contract as Uzudi', () => {
    const entry = characterManifestEntry('amirreza');
    const shipped = read('character-manifest-v4.json').characters.find(c => c.slug === 'amirreza');
    assert.ok(isProductionReady('amirreza'));
    assert.equal(entry.packVersion, shipped.pack_version);
    assert.equal(entry.locomotionStyle, shipped.locomotion_style);
    assert.equal(entry.displayName, 'AMIRREZA / امیررضا');
    assert.equal(entry.isDefaultActive, false);
    const profile = read('amirreza/manifests/amirreza_motion_profile.json');
    assert.equal(profile.style, 'wing-assisted');
    assert.ok(profile.physics_owns_jump_height && profile.dedicated_slide && profile.uniform_body_scale);
    const abilities = read('amirreza/manifests/amirreza_ability_profile.json');
    assert.equal(abilities.runner_physics, 'shared');
    assert.equal(abilities.combat, false);
});

test('AmirReza keeps the Uzudi wing and stride contract in every full and sampled pack', () => {
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite']) {
        const data = atlas('amirreza', variant), uzudi = atlas('uzudi', variant);
        assert.deepEqual(data.movement, uzudi.movement);
        assert.equal(data.meta.sourceKeyPoseCount, 60);
        assert.equal(Object.keys(data.frames).length, 672);
        assert.equal(data.animations.turn.frames.length, 8);
        for (const state of ['walk', 'run', 'sprint', 'takeoff', 'jump', 'fall', 'land', 'slide']) {
            const animation = data.animations[state];
            assert.equal(animation.locomotionStyle, 'wing-assisted');
            assert.deepEqual(Object.keys(animation.framesByDirection), data.meta.directions);
            assert.equal(animation.fps, uzudi.animations[state].fps);
            for (const direction of data.meta.directions) {
                assert.ok(animation.framesByDirection[direction].every(frame => data.frames[frame]));
            }
        }
        for (const state of ['walk', 'run', 'sprint']) {
            assert.equal(data.animations[state].cycleCount, 1);
            assert.equal(characterPlaybackRate(state, 1, data.animations[state]),
                characterPlaybackRate(state, 1, uzudi.animations[state]));
        }
        assert.equal(data.motion.jumpProgressDriver, 'vertical-velocity');
        assert.equal(data.render.physicsOwnsJumpHeight, true);
    }
});

test('all current game actions resolve to real AmirReza poses and low slides stay separate from running', () => {
    const data = atlas('amirreza', 'runtime');
    const animator = new FrameAnimator(data);
    for (const action of ['idle', 'breathe', 'blink', 'ready', 'walk', 'tiptoe', 'run', 'sprint',
        'takeoff', 'jump', 'fall', 'land', 'slide', 'crouch', 'turn', 'wave', 'salute', 'celebrate',
        'win', 'hop', 'hover', 'skid', 'dash', 'dodge']) {
        assert.ok(animator.has(action), action);
        animator.play(action); animator.update(.03);
        assert.ok(data.frames[animator.currentFrameName()], action);
    }
    assert.equal(data.animations.dodge.sharedFrameSource, 'slide');
    assert.equal(data.animations.hover.sharedFrameSource, 'jump');
    assert.ok(data.animations.slide.frames.every(frame => !data.animations.run.frames.includes(frame)));
});
