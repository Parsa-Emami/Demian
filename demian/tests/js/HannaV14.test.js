import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import { builtinCharacterAssetPair, builtinCharacterPreviewUrl } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { characterManifestEntry, isProductionReady } from '../../resources/js/game/characters/manifests/CharacterManifestRegistry.js';

const root = resolve(import.meta.dirname, '../../public/assets/characters');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const atlas = (variant = 'runtime') => json(`hanna/hanna-atlas-v14-${variant}.json`);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('Hanna is selectable through the shared roster with installed subpath-safe asset URLs', () => {
    const entry = characterManifestEntry('HANNA');
    const shipped = json('character-manifest-v4.json').characters.find(c => c.slug === 'hanna');
    assert.ok(isProductionReady('hanna'));
    assert.equal(entry.displayName, 'HANNA / حنا');
    assert.equal(entry.isDefaultActive, false);
    assert.equal(entry.packVersion, shipped.pack_version);
    assert.equal(shipped.locomotion_style, 'ground-runner');
    const targets = json('hanna/manifests/character_manifest_v4.json').runtime.atlas_targets;
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite']) {
        const pair = builtinCharacterAssetPair('hanna', variant, 'https://demian.test/game/');
        assert.equal(new URL(pair.spriteUrl).pathname, `/game/assets/characters/hanna/hanna-spritesheet-v14-${variant}.png`);
        assert.ok(existsSync(resolve(root, `hanna/hanna-spritesheet-v14-${variant}.png`)));
        assert.ok(existsSync(resolve(root, `hanna/hanna-atlas-v14-${variant}.json`)));
        assert.equal(targets[variant].atlas, `../hanna-atlas-v14-${variant}.json`);
        assert.equal(targets[variant].image, `../hanna-spritesheet-v14-${variant}.png`);
    }
    assert.ok(builtinCharacterPreviewUrl('hanna', 'https://demian.test/game/').endsWith('/hanna/hanna-preview-v14.png'));
});

test('every Hanna variant has complete directional actions, independent low slides and its exact paired image', () => {
    const states = ['idle', 'breathe', 'blink', 'ready', 'walk', 'tiptoe', 'run', 'sprint',
        'takeoff', 'jump', 'fall', 'land', 'slide', 'crouch', 'turn', 'wave', 'salute',
        'celebrate', 'win', 'hop', 'hover', 'skid', 'dash', 'dodge'];
    const layout = json('hanna/source-v14/layout.json');
    const profile = json('hanna/manifests/hanna_motion_profile.json');
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite']) {
        const data = atlas(variant), animator = new FrameAnimator(data);
        assert.equal(data.meta.sourceKeyPoseCount, 60);
        assert.equal(Object.keys(data.frames).length, 672);
        assert.equal(Object.keys(data.animations).length, states.length);
        assert.deepEqual(data.motion.locomotionProfile, profile.locomotion_profile);
        assert.deepEqual(data.motion.locomotionProfile.strideLengths, layout.locomotionProfile.strideLengths);
        const bytes = readFileSync(resolve(root, 'hanna', data.meta.image));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), data.meta.imageRevision);
        for (const state of states) {
            assert.ok(animator.has(state), state);
            animator.play(state); animator.update(.03);
            assert.ok(data.frames[animator.currentFrameName()], `${variant}/${state}`);
        }
        for (const state of ['walk', 'run', 'jump', 'fall', 'land', 'slide']) {
            assert.deepEqual(Object.keys(data.animations[state].framesByDirection), data.meta.directions);
        }
        assert.ok(data.animations.slide.frames.every(f => !data.animations.run.frames.includes(f)));
        assert.equal(data.render.physicsOwnsJumpHeight, true);
        assert.equal(data.render.frameBlend, false);
        assert.equal(data.companion, undefined);
    }
});

test('Hanna elegant cadence is distance-driven at every frame rate and retains supporting-foot phase across gaits', () => {
    const data = atlas(), standard = json('darya/darya-atlas-v14-runtime.json');
    assert.equal(data.motion.locomotionProfile.id, 'hanna-elegant-v2');
    assert.ok(data.motion.locomotionProfile.maxStrideHz < standard.motion.locomotionProfile.maxStrideHz);
    for (const state of ['walk', 'run', 'sprint']) for (const hz of [30, 60, 120]) {
        const speed = state === 'walk' ? 3.55 : state === 'run' ? 6.9 : 7.6;
        const avatar = new CanvasCharacterAvatar({ slug: 'hanna', atlas: data, image: {}, player: true });
        for (let i = 0; i < hz * 2; i++) avatar.sync({speed, motionState:state, grounded:true, position:{x:0,z:0}}, 1/hz);
        const expected = speed / data.motion.locomotionProfile.strideLengths[state];
        close(avatar.animator.locomotionFrequency, expected);
        close(avatar.animator.locomotionPhase, expected * 2);
        assert.ok(expected < speed / standard.motion.locomotionProfile.strideLengths[state]);
        const before = avatar.animator.locomotionPhase;
        avatar.sync({speed, motionState:state === 'walk' ? 'run' : 'walk', grounded:true}, 0);
        close(avatar.animator.locomotionPhase, before);
        advanceCharacterAnimation(avatar.animator, {state:'run',movementSpeed:100,travelledDistance:100,deltaTime:.1});
        assert.ok(avatar.animator.locomotionFrequency <= 1.3);
    }
});

test('Hanna runtime and lite retain full pose names within decoded image budgets', () => {
    for (const [variant, cells, budget] of [['runtime', 316, 12], ['lite', 239, 4]]) {
        const data = atlas(variant);
        assert.equal(data.meta.packedPhysicalFrameCount, cells);
        assert.ok(data.meta.decodedBytes <= budget * 1024 ** 2);
        assert.deepEqual(data.animations, atlas('mobile').animations);
        for (const state of ['walk', 'run', 'takeoff', 'jump', 'fall', 'land']) {
            const samples = new Set(data.animations[state].frames.map(id => `${data.frames[id].x}:${data.frames[id].y}`));
            assert.ok(samples.size > 2, `${variant}/${state} must move its limbs`);
        }
    }
});
