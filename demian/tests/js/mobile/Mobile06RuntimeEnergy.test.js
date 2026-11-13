import test from 'node:test';
import assert from 'node:assert/strict';
import GameRuntime from '../../../resources/js/game/runtime/GameRuntime.js';

function testHarness({ observeWork = null } = {}) {
    const pending = new Map(), canceled = [], idle = new Map(), idleCanceled = [];
    let id = 0, idleId = 0, updates = 0, renders = 0, fixed = 0, polls = 0;
    const visibility = Object.assign(new EventTarget(), { hidden: false });
    const runtime = new GameRuntime({
        visibilityTarget: visibility,
        requestFrame: fn => { pending.set(++id, fn); return id; },
        cancelFrame: key => { canceled.push(key); pending.delete(key); },
        scheduleIdlePoll: (callback, delay) => {
            assert.equal(delay, 125);
            idle.set(++idleId, callback);
            return idleId;
        },
        cancelIdlePoll: key => { idleCanceled.push(key); idle.delete(key); },
        inputRouter: { poll: () => { polls++; }, snapshot: () => ({}) },
        eventBus: { emit: () => {} },
        observeWork,
    });
    const game = {
        fixedUpdate: () => { fixed++; },
        update: () => { updates++; },
        render: () => { renders++; },
        pause: () => {},
        resume: () => {},
    };
    runtime.setGame(game);
    const fire = timestamp => {
        const [key, callback] = pending.entries().next().value;
        pending.delete(key);
        callback(timestamp);
    };
    const fireIdle = () => {
        const [key, callback] = idle.entries().next().value;
        idle.delete(key);
        callback();
    };
    return { runtime, visibility, pending, canceled, fire, idle, idleCanceled, fireIdle,
        counts: () => ({ fixed, updates, renders, polls }) };
}

test('pause cancels scheduled RAF immediately, remains silent, resumes with a zero-time first frame', () => {
    const h = testHarness();
    h.runtime.start();
    h.fire(100);
    h.fire(100 + 1000 / 60);
    assert.equal(h.counts().fixed, 1);
    assert.equal(h.pending.size, 1);

    h.runtime.pause();
    assert.equal(h.pending.size, 0);
    assert.equal(h.idle.size, 1, 'gamepad navigation is polled at a slower idle cadence');
    h.fireIdle();
    assert.equal(h.counts().polls, 3, 'one low-rate idle gamepad poll executed');
    assert.equal(h.idle.size, 1, 'idle polling reschedules only one timer');
    assert.equal(h.runtime.accumulator, 0);
    assert.equal(h.runtime.frameRequest, null);
    assert.equal(h.canceled.length, 1);
    h.runtime.pause();
    assert.equal(h.canceled.length, 1, 'duplicate pause does not cancel twice');

    h.runtime.resume();
    assert.equal(h.pending.size, 1);
    assert.equal(h.idle.size, 0);
    h.runtime.resume();
    assert.equal(h.pending.size, 1, 'double resume never schedules two loops');
    const before = h.counts();
    h.fire(500000);
    assert.equal(h.counts().fixed, before.fixed, 'hidden/paused time cannot advance simulation');
    h.fire(500000 + 1000 / 60);
    assert.equal(h.counts().fixed, before.fixed + 1);
    h.runtime.dispose();
    assert.equal(h.pending.size, 0);
});

test('visibility change and pause overlap without spinning or duplicating loops', () => {
    const h = testHarness();
    h.runtime.start();
    h.visibility.hidden = true;
    h.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(h.pending.size, 0);
    h.runtime.pause();
    assert.equal(h.idle.size, 0, 'hidden tabs never continue paused input polling');
    h.visibility.hidden = false;
    h.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(h.pending.size, 0, 'foreground page stays stopped while manually paused');
    assert.equal(h.idle.size, 1, 'visible pause receives low-rate gamepad input');
    h.runtime.resume();
    assert.equal(h.pending.size, 1);
    h.runtime.stop();
    assert.equal(h.pending.size, 0);
});

test('30 FPS presentations still execute original 60 Hz fixed physics and accumulate render time', () => {
    const h = testHarness();
    h.runtime.setRenderRate(30);
    h.runtime.start();
    for (let frame = 0; frame <= 60; frame++) h.fire(1000 + frame * 1000 / 60);
    const counts = h.counts();
    // Millisecond timestamps cannot exactly represent every 1/60-second
    // interval; one pending fractional step is expected at the boundary.
    assert.ok(counts.fixed >= 59 && counts.fixed <= 60, String(counts.fixed));
    assert.ok(counts.renders >= 30 && counts.renders <= 31, String(counts.renders));
    h.runtime.dispose();
});

test('optional work samples only observe active frames and cannot throw into game loop', () => {
    const times = [];
    const h = testHarness({ observeWork: duration => {
        times.push(duration);
        throw Error('QA reporter failure');
    } });
    h.runtime.start();
    assert.doesNotThrow(() => h.fire(100));
    assert.equal(times.length, 1);
    assert.ok(times[0] >= 0 && Number.isFinite(times[0]));
    h.runtime.pause();
    assert.equal(h.pending.size, 0);
    assert.equal(times.length, 1);
    h.runtime.dispose();
});
