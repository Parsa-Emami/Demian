import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MASTER_MOTION, MOTION_CHARACTERS, motionCharacter, masterFootPath, sampleMasterPose, solveTwoBone } from '../../resources/js/game/characters/motion/MasterMotionLibrary.js';
import MasterMotionController from '../../resources/js/game/characters/motion/MasterMotionController.js';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';

test('the twelve runtime characters resolve explicit immutable families and cosmetics', () => {
    assert.deepEqual(MOTION_CHARACTERS.map(entry => entry.slug), BUILTIN_CHARACTER_SLUGS);
    assert.equal(MOTION_CHARACTERS.filter(entry => entry.family === 'female-base-v1').length, 6);
    assert.equal(MOTION_CHARACTERS.filter(entry => entry.family === 'male-base-v1').length, 6);
    assert(Object.isFrozen(MASTER_MOTION.families));
    assert.equal(motionCharacter('TIAM').family, 'female-base-v1');
    assert.equal(motionCharacter('unregistered'), null);
    assert.throws(() => new MasterMotionController('unregistered'), RangeError);
});

test('members of a family produce exactly the same joints through every core state', () => {
    for (const state of ['idle', 'walk', 'run', 'sprint', 'takeoff', 'jump', 'fall', 'land', 'slide']) {
        for (const phase of [0, .13, .4, .62, .92]) {
            const samples = new Map();
            for (const definition of MOTION_CHARACTERS) {
                const controller = new MasterMotionController(definition.slug);
                const pose = controller.sync({ state, phase, progress: phase });
                if (samples.has(definition.family)) assert.deepEqual(pose.joints, samples.get(definition.family));
                else samples.set(definition.family, pose.joints);
            }
        }
    }
    assert.notDeepEqual(sampleMasterPose('male-base-v1', { state: 'run', phase: .2 }).joints,
        sampleMasterPose('female-base-v1', { state: 'run', phase: .2 }).joints);
});

test('grounded feet stay planted and IK limb lengths remain constant across complete cycles', () => {
    for (const family of Object.keys(MASTER_MOTION.families)) for (const state of ['walk', 'run', 'sprint']) {
        for (let i = 0; i < 480; i++) {
            const phase = i / 480;
            const pose = sampleMasterPose(family, { state, phase });
            for (const [side, offset] of [['Near', 0], ['Far', .5]]) {
                const expected = masterFootPath(phase + offset, MASTER_MOTION.clips[state]);
                if (expected.contact) {
                    assert(pose.contacts[side.toLowerCase()], `${family}/${state}/${i}/${side} lost contact`);
                    assert(Math.abs(pose.joints[`ankle${side}`].y) < 1e-8);
                }
                const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
                assert(Math.abs(distance(pose.joints[`hip${side}`], pose.joints[`knee${side}`]) - MASTER_MOTION.skeleton.upperLeg) < 1e-8);
                assert(Math.abs(distance(pose.joints[`knee${side}`], pose.joints[`ankle${side}`]) - MASTER_MOTION.skeleton.lowerLeg) < 1e-8);
            }
        }
    }
});

test('motion follows distance, keeps its phase when changing gait and stops when blocked', () => {
    const controller = new MasterMotionController('hanna');
    controller.advance({ state: 'walk', distance: .34, deltaTime: .1 });
    assert(Math.abs(controller.phase - .1) < 1e-10);
    controller.advance({ state: 'run', distance: .6, deltaTime: .1 });
    assert(Math.abs(controller.phase - .2) < 1e-10);
    controller.advance({ state: 'run', distance: 0, deltaTime: .1 });
    assert(Math.abs(controller.phase - .2) < 1e-10);
    controller.advance({ state: 'sprint', distance: 100, deltaTime: .1 });
    assert(Math.abs(controller.phase - .355) < 1e-10);
});

test('winged bodies retain the male family and accessories never modify the base pose', () => {
    const entries = ['amin', 'uzudi', 'amirreza'].map(slug => new MasterMotionController(slug));
    for (const entry of entries) entry.sync({ state: 'run', phase: .21 });
    assert.deepEqual(entries[0].pose.joints, entries[1].pose.joints);
    assert.deepEqual(entries[0].pose.joints, entries[2].pose.joints);
    assert.equal(entries[0].attachments.length, 0);
    assert.equal(entries[1].attachments[0].kind, 'wings');
    const rotation = entries[1].attachments[0].rotation;
    entries[1].sync({ state: 'run', phase: .55 });
    assert.notEqual(rotation, entries[1].attachments[0].rotation);
    entries[1].sync({ state: 'slide', phase: .5 });
    assert.equal(entries[1].attachments[0].extension, .15);
    for (const slug of ['darya', 'tiam']) {
        const entry = new MasterMotionController(slug);
        assert.equal(entry.attachments[0].collision, 'cosmetic');
    }
});

test('footfall events are edge triggered and remain correct when the renderer wraps at eight', () => {
    const controller = new MasterMotionController('amin');
    controller.sync({ state: 'run', phase: .49 });
    controller.sync({ state: 'run', phase: .51 });
    assert.deepEqual(controller.events.map(event => event.foot), ['far']);
    controller.sync({ state: 'run', phase: .51 });
    assert.equal(controller.events.length, 0);
    controller.sync({ state: 'run', phase: 7.99 });
    controller.sync({ state: 'run', phase: .01 });
    assert.deepEqual(controller.events.map(event => event.foot), ['near']);
});

test('all poses mirror deterministically and unreachable IK targets stay finite', () => {
    const a = sampleMasterPose('female-base-v1', { state: 'sprint', phase: .3 });
    const b = sampleMasterPose('female-base-v1', { state: 'sprint', phase: .3, facing: -1 });
    for (const key of Object.keys(a.joints)) {
        assert.equal(a.joints[key].x, -b.joints[key].x);
        assert.equal(a.joints[key].y, b.joints[key].y);
    }
    const unreachable = solveTwoBone({ x: 0, y: 0 }, { x: 100, y: 0 }, .2, .2);
    assert.equal(unreachable.reachable, false);
    assert(Number.isFinite(unreachable.joint.y));
});

test('the production frame animator exposes master poses without altering authored sprite ownership', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const data = JSON.parse(readFileSync(new URL(`../../public/assets/characters/${slug}/${slug}-atlas-v14-lite.json`, import.meta.url)));
        const animator = new FrameAnimator(data);
        assert.equal(animator.masterMotion.definition.slug, slug);
        animator.play('run');
        advanceCharacterAnimation(animator, { state: 'run', deltaTime: 1 / 60, movementSpeed: 6, travelledDistance: .1 });
        assert.equal(animator.masterMotion.pose.family, motionCharacter(slug).family);
        assert(data.frames[animator.currentFrameName()]);
        assert.equal(data.render.lockBodyScale, true);
    }
});

test('sliding lowers the silhouette through posture while preserving head size', () => {
    for (const family of Object.keys(MASTER_MOTION.families)) {
        const idle = sampleMasterPose(family);
        const slide = sampleMasterPose(family, { state: 'slide' });
        const radius = MASTER_MOTION.skeleton.headRadius;
        assert((slide.joints.head.y + radius) / (idle.joints.head.y + radius) <= .6);
        assert.equal(slide.contacts.near, true);
        assert.equal(slide.contacts.far, true);
    }
});

test('non-finite timing and distance inputs cannot poison a master pose', () => {
    const controller = new MasterMotionController('amin');
    controller.advance({ state: 'run', distance: Infinity, deltaTime: NaN });
    controller.sync({ state: 'idle', phase: Infinity, deltaTime: Infinity });
    assert.equal(controller.distance, 0);
    assert(Object.values(controller.pose.joints).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert(Object.values(sampleMasterPose('male-base-v1', { state: 'run', phase: Infinity, progress: NaN }).joints)
        .every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});
