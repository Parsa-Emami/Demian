import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import CharacterVisualService from '../../resources/js/game/characters/runtime/CharacterVisualService.js';
import { builtinCharacterAssetPair, builtinCharacterPreviewUrl, characterFrameWorldSize } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { characterManifestEntry, isProductionReady } from '../../resources/js/game/characters/manifests/CharacterManifestRegistry.js';

const root = resolve(import.meta.dirname, '../../public/assets/characters');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const atlas = (variant = 'runtime') => json(`arsal/arsal-atlas-v14-${variant}.json`);

test('Arsal retains the supplied reference and his own identity contract', () => {
    const layout = json('arsal/source-v14/layout.json');
    const identity = json('arsal/manifests/arsal_identity_contract.json');
    const reference = readFileSync(resolve(root, 'arsal/source-v14/reference.jpg'));
    assert.equal(createHash('sha256').update(reference).digest('hex'), layout.referenceInputs[0].sha256);
    assert.equal(layout.referenceInputs[0].name, 'IMG_20261022_122855_548.jpg');
    assert.deepEqual(identity.invariants, layout.identity);
    assert.ok(identity.invariants.some(value => value.includes('moustache')));
    assert.ok(identity.invariants.some(value => value.includes('necktie')));
    assert.deepEqual(layout.slideRows, [1]);
});

test('Arsal is selectable through the shared roster with installed subpath-safe asset URLs', () => {
    const entry = characterManifestEntry('ARSAL');
    const shipped = json('character-manifest-v4.json').characters.find(c => c.slug === 'arsal');
    assert.ok(isProductionReady('arsal'));
    assert.equal(entry.displayName, 'ARSAL / ارسل');
    assert.equal(entry.isDefaultActive, false);
    assert.equal(entry.packVersion, shipped.pack_version);
    assert.equal(shipped.locomotion_style, 'ground-runner');
    const targets = json('arsal/manifests/character_manifest_v4.json').runtime.atlas_targets;
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite']) {
        const pair = builtinCharacterAssetPair('arsal', variant, 'https://demian.test/game/');
        assert.equal(new URL(pair.spriteUrl).pathname, `/game/assets/characters/arsal/arsal-spritesheet-v14-${variant}.png`);
        assert.ok(existsSync(resolve(root, `arsal/arsal-spritesheet-v14-${variant}.png`)));
        assert.ok(existsSync(resolve(root, `arsal/arsal-atlas-v14-${variant}.json`)));
        assert.equal(targets[variant].atlas, `../arsal-atlas-v14-${variant}.json`);
        assert.equal(targets[variant].image, `../arsal-spritesheet-v14-${variant}.png`);
    }
    assert.ok(builtinCharacterPreviewUrl('arsal', 'https://demian.test/game/').endsWith('/arsal/arsal-preview-v14.png'));
});

test('every Arsal variant has complete directional actions, independent low slides and its exact paired image', () => {
    const states = ['idle', 'breathe', 'blink', 'ready', 'walk', 'tiptoe', 'run', 'sprint',
        'takeoff', 'jump', 'fall', 'land', 'slide', 'crouch', 'turn', 'wave', 'salute',
        'celebrate', 'win', 'hop', 'hover', 'skid', 'dash', 'dodge'];
    const profile = json('arsal/manifests/arsal_motion_profile.json');
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite']) {
        const data = atlas(variant), animator = new FrameAnimator(data);
        assert.equal(data.meta.sourceKeyPoseCount, 68);
        assert.equal(Object.keys(data.frames).length, 672);
        assert.equal(Object.keys(data.animations).length, states.length);
        assert.deepEqual(data.motion.locomotionProfile, profile.locomotion_profile);
        const bytes = readFileSync(resolve(root, 'arsal', data.meta.image));
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

test('Arsal runtime and lite retain full pose names within decoded image budgets', () => {
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

test('Arsal walking and running use calibrated artwork inside the same world footprint as the other characters', () => {
    for (const variant of ['desktop','mobile','compact','runtime','lite']) {
        const data = atlas(variant);
        const calibration = data.render.bodyScaleCalibration;
        assert.equal(calibration.method, 'authored-standing-pose-height');
        assert.deepEqual(Object.keys(calibration.referencePoseIndices), ['walk','run','land','celebrate']);
        assert.equal(calibration.targetBodyHeightRatio, data.render.referenceBodyHeightRatio);
        const metrics = characterFrameWorldSize(data);
        for (const slug of ['darya','setayesh','uzudi','negar','tiam','amirreza','hanna']) {
            const other = characterFrameWorldSize(json(`${slug}/${slug}-atlas-v14-${variant}.json`));
            assert.equal(metrics.frameHeight, metrics.frameWidth);
            assert.ok(Math.abs(metrics.frameHeight - other.frameHeight) < .2);
            assert.equal(metrics.bodyHeight, other.bodyHeight);
        }
        assert.equal(data.render.lockBodyScale, true);
    }
});

test('Arsal selection survives service recreation and resolves the cafe and runner player', () => {
    let value = null;
    const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
    const first = new CharacterVisualService({ storage });
    assert.equal(first.setActiveSlug('ARSAL'), 'arsal');
    const restored = new CharacterVisualService({ storage });
    assert.equal(restored.activeSlug, 'arsal');
    assert.equal(restored.resolveSlug('runner-player', { player: true }), 'arsal');
    assert.equal(restored.resolveSlug('cafe-player', { player: true }), 'arsal');
    for (const variant of ['runtime', 'lite']) {
        const data = atlas(variant);
        const avatar = new CanvasCharacterAvatar({ slug: restored.activeSlug, atlas: data, image: {}, player: true });
        for (const state of ['walk', 'run', 'slide']) {
            avatar.sync({ speed: 6.9, grounded: true, motionState: state, position: { x: 0, z: 0 } }, .1);
            assert.equal(avatar.state, state);
            assert.ok(data.frames[avatar.animator.currentFrameName()]);
        }
        assert.equal(data.movement.style, 'ground-runner');
        assert.deepEqual(data.movement.wingPoweredStates, []);
    }
});
