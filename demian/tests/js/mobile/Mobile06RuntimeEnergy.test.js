import test from 'node:test';
import assert from 'node:assert/strict';
import GameRuntime from '../../../resources/js/game/runtime/GameRuntime.js';

function testHarness({ observeWork = null } = {}) {
    const pending = new Map(), canceled = [];
    let id = 0, updates = 0, renders = 0, fixed = 0, polls = 0;
    const visibility = Object.assign(new EventTarget(), { hidden: false });
    const runtime = new GameRuntime({
        visibilityTarget: visibility,
        requestFrame: fn => { pending.set(++id, fn); return id; },
        cancelFrame: key => { canceled.push(key); pending.delete(key); },
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
    return { runtime, visibility, pending, canceled, fire,
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
    assert.equal(h.runtime.accumulator, 0);
    assert.equal(h.runtime.frameRequest, null);
    assert.equal(h.canceled.length, 1);
    h.runtime.pause();
    assert.equal(h.canceled.length, 1, 'duplicate pause does not cancel twice');

    h.runtime.resume();
    assert.equal(h.pending.size, 1);
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
    h.visibility.hidden = false;
    h.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(h.pending.size, 0, 'foreground page stays stopped while manually paused');
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
    assert.equal(counts.fixed, 60);
    assert.equal(counts.renders, 31);
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
