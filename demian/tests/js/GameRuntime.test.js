import test from 'node:test';
import assert from 'node:assert/strict';
import GameRuntime from '../../resources/js/game/runtime/GameRuntime.js';

function createRuntime(overrides = {}) {
    const inputCalls = [];
    const inputRouter = {
        snapshot(options) {
            inputCalls.push(options);
            return { sequence: inputCalls.length };
        },
    };
    const events = [];
    const eventBus = {
        emit(name, payload) {
            events.push({ name, payload });
        },
    };
    const runtime = new GameRuntime({
        inputRouter,
        eventBus,
        requestFrame: () => 1,
        cancelFrame: () => undefined,
        visibilityTarget: null,
        ...overrides,
    });

    return { runtime, inputCalls, events };
}

function createGame() {
    return {
        fixed: [],
        updates: [],
        renders: [],
        pauseCount: 0,
        resumeCount: 0,
        fixedUpdate(delta, input) {
            this.fixed.push({ delta, input });
        },
        update(delta) {
            this.updates.push(delta);
        },
        render(alpha, delta) {
            this.renders.push({ alpha, delta });
        },
        pause() {
            this.pauseCount += 1;
        },
        resume() {
            this.resumeCount += 1;
        },
    };
}

test('GameRuntime advances game logic with a deterministic fixed step', () => {
    const { runtime, inputCalls } = createRuntime();
    const game = createGame();
    runtime.setGame(game);

    runtime.step(1 / 30);

    assert.equal(game.fixed.length, 2);
    assert.equal(game.fixed[0].delta, 1 / 60);
    assert.deepEqual(inputCalls, [
        { consumePresses: true },
        { consumePresses: false },
    ]);
    assert.equal(game.updates.length, 1);
    assert.equal(game.renders.length, 1);
    assert.ok(Math.abs(game.renders[0].alpha) < 1e-9);
});

test('GameRuntime keeps transient input queued until a fixed step occurs', () => {
    const { runtime, inputCalls } = createRuntime();
    const game = createGame();
    runtime.setGame(game);

    runtime.step(1 / 120);
    assert.equal(game.fixed.length, 0);
    assert.equal(inputCalls.length, 0);

    runtime.step(1 / 120);
    assert.equal(game.fixed.length, 1);
    assert.deepEqual(inputCalls, [{ consumePresses: true }]);
});

test('GameRuntime caps catch-up work and reports dropped simulation time', () => {
    const { runtime, events } = createRuntime({
        maxFrameDelta: 1,
        maxSubSteps: 3,
    });
    const game = createGame();
    runtime.setGame(game);

    runtime.step(0.2);

    assert.equal(game.fixed.length, 3);
    assert.equal(events.at(-1).name, 'runtime:frame-drop');
    assert.ok(game.renders[0].alpha >= 0 && game.renders[0].alpha < 1);
});

test('GameRuntime pause and resume notify the active game once', () => {
    const { runtime } = createRuntime();
    const game = createGame();
    runtime.setGame(game);

    runtime.pause();
    runtime.pause();
    runtime.resume();
    runtime.resume();

    assert.equal(game.pauseCount, 1);
    assert.equal(game.resumeCount, 1);
});

test('GameRuntime keeps requesting frames after a recoverable render error', () => {
    const callbacks = [];
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
        const { runtime, events } = createRuntime({
            requestFrame(callback) {
                callbacks.push(callback);
                return callbacks.length;
            },
        });
        const game = createGame();
        game.render = () => {
            throw new Error('temporary WebGL state error');
        };
        runtime.setGame(game);
        runtime.start();

        assert.equal(callbacks.length, 1);
        callbacks[0](1000);

        assert.equal(runtime.running, true);
        assert.equal(callbacks.length, 2);
        assert.equal(events.at(-1).name, 'runtime:error');
        assert.equal(events.at(-1).payload.phase, 'render');
        assert.equal(events.at(-1).payload.recoverable, true);
    } finally {
        console.error = originalConsoleError;
    }
});

test('30 Hz presentation keeps the original 60 Hz simulation and accumulates render delta', () => {
    const { runtime } = createRuntime();
    const game = createGame();
    runtime.setGame(game);
    runtime.setRenderRate(30);
    runtime.step(0);
    for (let frame = 0; frame < 60; frame++) runtime.step(1 / 60);
    assert.equal(game.fixed.length, 60);
    assert.equal(game.renders.length, 31);
    assert.ok(Math.abs(game.renders.slice(1).reduce((sum, render) => sum + render.delta, 0) - 1) < 1e-9);
});

test('a hidden page cancels the pending frame and starts with zero elapsed time on return', () => {
    const target = Object.assign(new EventTarget(), { hidden: false });
    const callbacks = new Map();
    let frame = 0;
    const { runtime } = createRuntime({
        visibilityTarget: target,
        requestFrame(callback) { callbacks.set(++frame, callback); return frame; },
        cancelFrame(id) { callbacks.delete(id); },
    });
    const runFrame = (timestamp) => {
        const [id, callback] = callbacks.entries().next().value;
        callbacks.delete(id);
        callback(timestamp);
    };
    const game = createGame();
    runtime.setGame(game);
    runtime.start();
    runFrame(0);
    runFrame(1000 / 60);
    assert.equal(game.fixed.length, 1);
    target.hidden = true;
    target.dispatchEvent(new Event('visibilitychange'));
    assert.equal(callbacks.size, 0);
    target.hidden = false;
    target.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new Event('visibilitychange'));
    assert.equal(callbacks.size, 1);
    runFrame(10000);
    assert.equal(game.fixed.length, 1);
    assert.equal(game.renders.at(-1).delta, 0);
    runtime.dispose();
    assert.equal(callbacks.size, 0);
});

test('lost render surfaces freeze game time until the next clean frame', () => {
    const callbacks = [];
    let available = false;
    const { runtime } = createRuntime({ canRender: () => available, requestFrame(callback) { callbacks.push(callback); return callbacks.length; } });
    const game = createGame();
    runtime.setGame(game);
    runtime.start();
    callbacks[0](100);
    assert.equal(game.renders.length, 0);
    available = true;
    callbacks[1](2100);
    assert.equal(game.fixed.length, 0);
    assert.equal(game.renders.at(-1).delta, 0);
});
