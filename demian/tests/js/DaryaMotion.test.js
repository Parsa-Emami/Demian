import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import CompanionController from '../../resources/js/game/characters/CompanionController.js';
import { DIRECTION_VECTORS, DirectionTransition } from '../../resources/js/game/characters/DirectionResolver.js';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import { groundContactCorrection } from '../../resources/js/game/rendering2d/PixelActorRenderer.js';

const atlas = variant => JSON.parse(readFileSync(new URL(
    `../../public/assets/characters/darya/darya-atlas-v15-${variant}.json`, import.meta.url)));
const lite = atlas('lite');
const dt = 1 / 60;

test('Darya holds the supporting foot through each travelled-distance subframe', () => {
    const animator = new FrameAnimator(lite);
    for (const state of ['walk', 'run', 'sprint']) {
        animator.play(state);
        const { count, stride, stance } = animator.animation.groundContact;
        for (const direction of Object.keys(DIRECTION_VECTORS)) {
            animator.setDirection(direction);
            for (let index = 0; index < count; index++) {
                const phase = (index + .25) / count;
                animator.locomotionPhase = phase;
                animator.motionState = state;
                animator.seekLoop(phase);
                const initial = animator.sample();
                const correction = groundContactCorrection(animator, initial);
                const planted = index / count % .5 < stance;
                assert.equal(Math.abs(correction - (planted ? stride / count * .25 : 0)) < 1e-8, true);
                const distance = stride / count * .3;
                advanceCharacterAnimation(animator, { state, travelledDistance: distance, movementSpeed: 6, deltaTime: .04 });
                assert.equal(animator.sample().frameName, initial.frameName);
                if (planted) assert.ok(Math.abs(groundContactCorrection(animator, animator.sample()) - correction - distance) < 1e-8);
            }
        }
    }
});

test('Darya turns through adjacent headings and keeps her gait phase', () => {
    const animator = new FrameAnimator(lite);
    animator.play('run');
    animator.seekLoop(.39);
    const turning = new DirectionTransition(lite.render.directionStepSeconds);
    const route = [];
    for (let ticks = 0; ticks < 24; ticks++) {
        const facing = turning.toward(animator.direction, 'w', dt);
        if (facing !== animator.direction) route.push(facing);
        animator.setDirection(facing);
        assert.ok(Math.abs(animator.continuousProgress() - .39) < 1e-8);
    }
    assert.deepEqual(route, ['se', 's', 'sw', 'w']);
});

test('Pishi retains its own pace and position around a turn and a quality upgrade', () => {
    const avatar = new CanvasCharacterAvatar({ slug: 'darya', image: {}, atlas: lite, companionImage: {} });
    const companion = avatar.companion;
    const owner = { x: 0, z: 0, forward: { x: 1, z: 0 }, speed: 6, grounded: true };
    const observations = new Set();
    const headings = new Set();
    avatar.sync(owner, dt);
    for (const [x, z] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        owner.forward = { x, z };
        for (let step = 0; step < 60; step++) {
            const previous = companion.sample().world;
            owner.x += x * .1;
            owner.z += z * .1;
            avatar.sync(owner, dt);
            const current = companion.sample();
            const moved = Math.hypot(current.world.x - previous.x, current.world.z - previous.z);
            assert.ok(moved <= 13 * dt + 1e-9);
            assert.ok(Math.hypot(owner.x - current.world.x, owner.z - current.world.z) < 3.25);
            headings.add(companion.direction);
            observations.add(companion.state);
        }
    }
    assert.ok(headings.size >= 4);
    assert.ok(observations.has('run'));
    const before = companion.sample();
    avatar.replaceVisualAssets({}, atlas('detail'), {});
    assert.equal(avatar.companion, companion);
    assert.deepEqual(avatar.companion.sample(), before);
    owner.x += 14;
    avatar.sync(owner, dt);
    assert.ok(Math.hypot(owner.x - companion.sample().world.x, owner.z - companion.sample().world.z) < 1.5);
    assert.deepEqual(companion.sample(0).world, companion.sample().world);
});

test('Pishi clears walls without a gameplay collider and hops independently in Dino Run', () => {
    const world = new CompanionController(lite.companion, {});
    world.canMove = (_, to) => to.x > -.8;
    const owner = { x: 0, z: 0 };
    world.updateWorld(owner, 'e', dt);
    for (let step = 0; step < 30; step++) world.updateWorld(owner, 'e', dt, true);
    assert.ok(world.sample().world.x > -.8);
    assert.equal(world.sample().elevation, 0);

    const runner = new CompanionController(lite.companion, {}, { sideView: true });
    const actions = new Set();
    for (let step = 0; step < 60; step++) {
        runner.updateRunner('e', dt, 7, step < 32, false);
        if (step < 6) assert.equal(runner.sample().elevation, 0);
        actions.add(runner.state);
    }
    assert.deepEqual([...actions], ['run', 'takeoff', 'jump', 'fall', 'land']);
    assert.equal(runner.sample().elevation, 0);
    assert.ok(runner.sample().runnerOffset < -25);
    runner.updateRunner('e', dt, 7, false, true);
    assert.equal(runner.state, 'crouch');
});

test('Pishi finishes both leaps when the runner jumps again during its recovery', () => {
    const runner = new CompanionController(lite.companion, {}, { sideView: true });
    let leaps = 0;
    for (let step = 0; step < 110; step++) {
        const wasAirborne = runner.elevation > 0;
        runner.updateRunner('e', dt, 7, step < 25 || (step >= 29 && step < 54), false);
        if (!wasAirborne && runner.elevation > 0) leaps++;
    }
    assert.equal(leaps, 2);
    runner.resetRunner('e');
    assert.equal(runner.state, 'idle');
    assert.equal(runner.sample().elevation, 0);
});
