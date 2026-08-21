import assert from 'node:assert/strict';
import test from 'node:test';
import { characterPresentationPose } from '../../resources/js/game/characters/CharacterMotionProfile.js';

function poseAt(state, progress, overrides = {}) {
    return characterPresentationPose({ state, progress, direction: 'e', facing: 1, ...overrides });
}

test('walk/run/idle presentation pose is a pure function of animator progress (frame-locked, not wall-clock)', () => {
    for (const state of ['idle', 'walk', 'run']) {
        const a = poseAt(state, 0.37, { presentationTime: 1.1, stateTime: 1.1 });
        const b = poseAt(state, 0.37, { presentationTime: 47.9, stateTime: 8.4 });
        assert.deepEqual(a, b, `${state}: pose must depend only on progress, not on elapsed wall-clock time`);
    }
});

test('walk bob completes exactly two ground-contact peaks per full baked loop (one per foot)', () => {
    const samples = 400;
    let peaks = 0;
    let rising = true;
    let previous = poseAt('walk', 0).bob;
    for (let i = 1; i <= samples; i += 1) {
        const bob = poseAt('walk', i / samples).bob;
        if (rising && bob < previous) {
            peaks += 1;
            rising = false;
        } else if (!rising && bob > previous) {
            rising = true;
        }
        previous = bob;
    }
    assert.equal(peaks, 2);
});

test('walk pose returns to its starting values at progress=0 and progress=1 (no pop on loop restart)', () => {
    const start = poseAt('walk', 0);
    const end = poseAt('walk', 1);
    assert.ok(Math.abs(start.bob - end.bob) < 1e-9);
    assert.ok(Math.abs(start.tilt - end.tilt) < 1e-9);
    assert.ok(Math.abs(start.x - end.x) < 1e-9);
});

test('tiptoe follows the same phase as walk (scoped to its own animation timing) but with reduced amplitude', () => {
    const walk = poseAt('walk', 0.25);
    const tiptoe = poseAt('tiptoe', 0.25);
    // Same sign/direction of motion at the same progress...
    assert.equal(Math.sign(walk.tilt), Math.sign(tiptoe.tilt));
    // ...but tiptoe's bob is scaled down (0.86x) rather than running at a
    // different, independently-tuned frequency.
    assert.ok(Math.abs(tiptoe.bob - walk.bob * 0.86) < 1e-9);
});

test('idle breathing resets cleanly with the animator instead of drifting on every re-entry to idle', () => {
    // Simulates: walk for a while, then re-enter idle. Old behaviour kept
    // accumulating presentationTime across the state change, so the breath
    // phase at animation-frame-0 was different (and unpredictable) every
    // single time. New behaviour: progress=0 always means the same pose.
    const freshEntry = poseAt('idle', 0, { presentationTime: 2.05, stateTime: 0 });
    const laterEntry = poseAt('idle', 0, { presentationTime: 91.3, stateTime: 0 });
    assert.deepEqual(freshEntry, laterEntry);
});

test('hover/fall flutter is frame-locked (progress-driven); takeoff/jump/hop keep a continuous flutter so it does not freeze on a held frame', () => {
    for (const state of ['hover', 'fall']) {
        const a = poseAt(state, 0.5, { presentationTime: 1, stateTime: 1 });
        const b = poseAt(state, 0.5, { presentationTime: 9, stateTime: 9 });
        assert.deepEqual(a, b, `${state} should be progress-locked`);
    }
    for (const state of ['takeoff', 'jump', 'hop']) {
        const a = poseAt(state, 0.5, { presentationTime: 1, stateTime: 1 });
        const b = poseAt(state, 0.5, { presentationTime: 9, stateTime: 9 });
        assert.notDeepEqual(a, b, `${state} should keep flowing after its one-shot clip finishes`);
    }
});
