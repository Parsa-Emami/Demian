import test from 'node:test';
import assert from 'node:assert/strict';
import GameRuntime from '../../resources/js/game/runtime/GameRuntime.js';

function rig({ fixedStep = 1 / 60, maxFrameDelta = .045, maxSubSteps = 5,
    observeFrame = null, observeRender = null, canRender = () => true } = {}) {
    const visibility = Object.assign(new EventTarget(), { hidden: false });
    const raf = new Map();
    const history = new Map();
    const canceled = [];
    const events = [];
    const inputs = [];
    let next = 0, polls = 0;
    const runtime = new GameRuntime({
        fixedStep, maxFrameDelta, maxSubSteps, visibilityTarget: visibility,
        requestFrame(callback) {
            const id = ++next;
            raf.set(id, callback);
            history.set(id, callback);
            return id;
        },
        cancelFrame(id) { canceled.push(id); raf.delete(id); },
        inputRouter: {
            poll() { polls++; },
            snapshot(options) { inputs.push(options); return { pressed: options.consumePresses }; },
        },
        eventBus: { emit(name, payload) { events.push({ name, payload }); } },
        observeFrame, observeRender, canRender,
    });
    const game = {
        frames: [], updates: [], renders: [], pauses: 0, resumes: 0,
        fixedUpdate(dt, input) { this.frames.push({ dt, input }); },
        update(dt) { this.updates.push(dt); },
        render(alpha, dt) { this.renders.push({ alpha, dt }); },
        pause() { this.pauses++; },
        resume() { this.resumes++; },
    };
    runtime.setGame(game);
    const fire = at => {
        const first = raf.entries().next().value;
        assert.ok(first, 'Expected a scheduled RAF');
        raf.delete(first[0]);
        first[1](at);
        return first[0];
    };
    return { runtime, game, visibility, raf, history, canceled, events, inputs,
        fire, polls: () => polls };
}

test('Phase 4 Step 17: fixed game simulation is invariant across 30, 60, 120 and 144Hz presentation', () => {
    const results = [];
    for (const hz of [30, 60, 120, 144]) {
        const { runtime, game, fire } = rig();
        runtime.setRenderRate(hz === 30 ? 30 : 60);
        runtime.start();
        // First RAF is a zero-time warm-up and the following 10 s are exactly
        // partitioned by refresh rate, with no interpolation of game scores.
        for (let i = 0; i <= hz * 10; i++) fire(1000 + i * 1000 / hz);
        const count = game.frames.length;
        assert.ok(Math.abs(count - 600) <= 1, hz + 'Hz produced ' + count + ' fixed ticks');
        assert.equal(game.frames.every(entry => entry.dt === 1 / 60), true);
        assert.ok(game.renders.length <= Math.min(hz, 60) * 10 + 2);
        assert.ok(game.renders.every(entry => entry.alpha >= 0 && entry.alpha <= 1));
        results.push(count);
        runtime.dispose();
    }
    assert.ok(Math.max(...results) - Math.min(...results) <= 1, results.join(', '));
});

test('Phase 4 Step 17: a completed run that pauses in fixedUpdate cannot update, render or run a second step', () => {
    const h = rig({ maxFrameDelta: 1 });
    h.game.fixedUpdate = function (dt) {
        this.frames.push({ dt });
        h.runtime.pause();
    };
    h.runtime.start();
    h.fire(0);
    h.fire(100);
    assert.equal(h.game.frames.length, 1);
    assert.equal(h.game.updates.length, 1, 'only pre-completion zero-time render may update');
    assert.equal(h.game.renders.length, 1);
    assert.equal(h.runtime.accumulator, 0);
    assert.equal(h.raf.size, 0);
    assert.equal(h.game.pauses, 1);
    h.runtime.resume();
    h.fire(4000);
    assert.equal(h.game.frames.length, 1, 'first resume frame must not catch up');
    h.runtime.dispose();
});

test('Phase 4 Step 17: setting another game inside a fixed tick cannot invoke old-game update or render', () => {
    const h = rig({ maxFrameDelta: 1 });
    const next = {
        frames: 0, updates: 0, renders: 0,
        fixedUpdate() { this.frames++; },
        update() { this.updates++; },
        render() { this.renders++; },
    };
    h.game.fixedUpdate = function () {
        this.frames.push(1);
        h.runtime.setGame(next);
    };
    h.runtime.step(0.2);
    assert.equal(h.game.frames.length, 1);
    assert.equal(h.game.updates.length, 0);
    assert.equal(h.game.renders.length, 0);
    assert.equal(next.frames, 0, 'new game starts on the next scheduling slice');
    assert.equal(h.runtime.accumulator, 0);
    h.runtime.step(1 / 60);
    assert.equal(next.frames, 1);
    assert.equal(next.updates, 1);
    assert.equal(next.renders, 1);
});

test('Phase 4 Step 17: canceled RAF callbacks stay inert even if delivered after game switches', () => {
    const h = rig();
    h.runtime.start();
    const stale = h.history.get([...h.raf.keys()][0]);
    h.runtime.setGame(h.game);
    assert.equal(h.canceled.length, 1);
    assert.equal(h.raf.size, 1);
    const before = h.polls();
    stale(20000);
    assert.equal(h.polls(), before);
    assert.equal(h.game.frames.length, 0);
    assert.equal(h.raf.size, 1);
    h.fire(20000);
    h.fire(20000 + 1000 / 60);
    assert.equal(h.game.frames.length, 1);

    const staleAfterStop = h.history.get([...h.raf.keys()][0]);
    h.runtime.stop();
    staleAfterStop(100000);
    assert.equal(h.raf.size, 0);
    assert.equal(h.game.frames.length, 1);
    h.runtime.dispose();
    h.runtime.start();
    h.runtime.resume();
    h.runtime.setGame(h.game);
    assert.equal(h.raf.size, 0, 'dispose makes the scheduler terminal');
});

test('Phase 4 Step 17: a thrown simulation step fails closed and cannot silently corrupt a ranked replay', () => {
    const h = rig({ maxFrameDelta: 1 });
    const oldLog = console.error;
    console.error = () => {};
    try {
        h.game.fixedUpdate = () => { throw Error('partial simulation state'); };
        h.runtime.start();
        h.fire(0);
        const renders = h.game.renders.length;
        h.fire(50);
        assert.equal(h.runtime.faulted, true);
        assert.equal(h.runtime.paused, true);
        assert.equal(h.raf.size, 0);
        assert.equal(h.game.renders.length, renders);
        assert.equal(h.events.filter(event => event.name === 'runtime:fatal').length, 1);
        assert.equal(h.events.find(event => event.name === 'runtime:error').payload.phase, 'simulation');
        h.runtime.resume();
        assert.equal(h.runtime.paused, true);
        assert.equal(h.raf.size, 0);
        const replacement = { fixedUpdate() {}, update() {}, render() {}, pause() {}, resume() {} };
        h.runtime.setGame(replacement);
        h.runtime.resume();
        assert.equal(h.runtime.faulted, false);
        assert.equal(h.runtime.paused, false);
        assert.equal(h.raf.size, 1);
    } finally {
        h.runtime.dispose();
        console.error = oldLog;
    }
});

test('Phase 4 Step 17: update errors are fatal, but observer and render errors remain isolated', () => {
    const log = console.error;
    console.error = () => {};
    try {
        const h = rig({ observeFrame() { throw Error('QA frame'); },
            observeRender() { throw Error('QA render'); } });
        h.runtime.start();
        h.fire(0);
        h.fire(1000 / 60);
        assert.ok(h.game.frames.length >= 1);
        assert.equal(h.runtime.faulted, false);
        assert.ok(h.events.some(x => x.name === 'runtime:error' && x.payload.phase === 'observer'));

        h.game.render = () => { throw Error('Canvas recovered next frame'); };
        h.fire(2000 / 60);
        assert.equal(h.runtime.faulted, false);
        assert.equal(h.raf.size, 1);

        h.game.update = () => { throw Error('partially updated score'); };
        h.fire(3000 / 60);
        assert.equal(h.runtime.faulted, true);
        assert.equal(h.raf.size, 0);
        assert.ok(h.events.some(x => x.name === 'runtime:fatal' && x.payload.phase === 'update'));
        h.runtime.dispose();
    } finally {
        console.error = log;
    }
});

test('Phase 4 Step 17: 1 second frame loss clamps work and emits exact dropped simulation budget', () => {
    const h = rig({ maxFrameDelta: 1, maxSubSteps: 3 });
    h.runtime.step(1);
    assert.equal(h.game.frames.length, 3);
    const loss = h.events.find(event => event.name === 'runtime:frame-drop');
    assert.ok(loss);
    assert.equal(loss.payload.steps, 3);
    assert.ok(Math.abs(loss.payload.droppedSeconds - .95) < 1e-8);
    assert.ok(h.runtime.accumulator >= 0 && h.runtime.accumulator < 1 / 60);
    assert.ok(h.game.renders[0].alpha >= 0 && h.game.renders[0].alpha < 1);
});

test('Phase 4 Step 17: NaN, negative time and lost surface never poison the fixed-step clock', () => {
    let available = true;
    const h = rig({ canRender: () => available });
    h.runtime.start();
    h.fire(100);
    h.fire(NaN);
    assert.ok(Number.isFinite(h.runtime.accumulator));
    h.fire(200);
    assert.equal(h.game.frames.length, 0, 'invalid timestamp resets the clock');
    h.fire(201);
    available = false;
    h.fire(500);
    available = true;
    h.fire(100000);
    assert.equal(h.game.frames.length, 0, 'surface recovery does not fast-forward');
    h.fire(100000 + 1000 / 60);
    assert.equal(h.game.frames.length, 1);
    h.runtime.dispose();
});

test('Phase 4 Step 17: input polling failure does not starve simulation; snapshot failure must stop', () => {
    const h = rig();
    const log = console.error;
    console.error = () => {};
    try {
        h.runtime.inputRouter.poll = () => { throw Error('disconnected gamepad'); };
        h.runtime.start();
        h.fire(0);
        h.fire(1000 / 60);
        assert.equal(h.game.frames.length, 1);
        assert.equal(h.runtime.faulted, false);
        h.runtime.inputRouter.snapshot = () => { throw Error('input not coherent'); };
        h.fire(2000 / 60);
        assert.equal(h.runtime.faulted, true);
        assert.equal(h.events.find(e => e.name === 'runtime:fatal').payload.phase, 'simulation');
    } finally {
        h.runtime.dispose();
        console.error = log;
    }
});

test('Phase 4 Step 17: invalid timing configuration rejects before mounting any event listeners', () => {
    for (const options of [
        { fixedStep: 0 }, { fixedStep: NaN }, { fixedStep: Infinity },
        { maxFrameDelta: -1 }, { maxFrameDelta: NaN },
        { maxSubSteps: 0 }, { maxSubSteps: 2.5 },
        { idlePollIntervalMs: 0 },
    ]) {
        assert.throws(() => new GameRuntime({
            inputRouter: {}, eventBus: {}, visibilityTarget: new EventTarget(),
            ...options,
        }), RangeError);
    }
});
