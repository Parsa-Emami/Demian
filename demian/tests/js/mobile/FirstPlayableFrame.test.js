import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import FirstPlayableFrame from '../../../resources/js/game/performance/FirstPlayableFrame.js';
import GameRegistry from '../../../resources/js/game/registry/GameRegistry.js';

const game = {}, previous = {};
const frame = (overrides = {}) => ({ game, timestamp: 150, playing: true, loaderHidden: true, presentedFrames: 11, ...overrides });

test('first playable frame is not recorded before session readiness, overlay removal and correct game render', () => {
    const tracker = new FirstPlayableFrame();
    tracker.start('open-world', 100);
    assert.equal(tracker.observe(frame()), null);
    tracker.arm(game, 10);
    for (const overrides of [{game: previous}, {playing: false}, {loaderHidden: false}, {timestamp: 99}, {timestamp: NaN}, {presentedFrames: 10}, {presentedFrames: undefined}]) {
        assert.equal(tracker.observe(frame(overrides)), null);
    }
    assert.deepEqual(tracker.observe(frame()), {gameId: 'open-world', sequence: 1, durationMs: 50});
    assert.equal(tracker.observe(frame()), null);
    assert.equal(tracker.last.durationMs, 50);
});

test('failed or superseded launch cannot accept late render', () => {
    const tracker = new FirstPlayableFrame();
    tracker.start('dino-run', 10);
    tracker.arm(previous, 10);
    tracker.start('coffee-crash', 20);
    assert.equal(tracker.observe(frame({game: previous})), null);
    tracker.arm(game, 10);
    tracker.clear();
    assert.equal(tracker.observe(frame()), null);
    assert.equal(tracker.last, null);
});

test('early module promise is reused; create does not require a second module fetch', async () => {
    class Game {
        preload() {} enter() {} startSession() {} applySettings() {} fixedUpdate() {}
        update() {} render() {} pause() {} resume() {} exit() {} dispose() {}
    }
    let calls = 0;
    const registry = new GameRegistry({ demo: {loader: async () => { calls++; return {default: Game}; }}});
    const pending = registry.load('demo');
    const result = await registry.create('demo', pending);
    assert.ok(result instanceof Game);
    assert.equal(calls, 1);
    assert.notEqual(await registry.create('demo'), result);
    assert.equal(calls, 1);
});

test('rejected early import is not silently retried and the next explicit launch can recover', async () => {
    let count = 0;
    const registry = new GameRegistry({ demo: {loader: async () => { count++; throw Error('network'); }}});
    const pending = registry.load('demo');
    void pending.catch(() => undefined);
    await assert.rejects(registry.create('demo', pending), /network/);
    assert.equal(count, 1);
    await assert.rejects(registry.load('demo'), /network/);
    assert.equal(count, 2);
});

test('runtime resumes only after startSession and shell close; module starts before loading UI', () => {
    const source = readFileSync(new URL('../../../resources/js/game/application/GameApplication.js', import.meta.url), 'utf8');
    const launch = source.slice(source.indexOf('    launchGame('), source.indexOf('    async beginGameSession('));
    const begin = source.slice(source.indexOf('    async beginGameSession('), source.indexOf('    async performGameSwitch('));
    assert.ok(launch.indexOf('this.registry.load(gameId)') < launch.indexOf('await this.shell.showLoading'));
    assert.ok(begin.indexOf('await this.activeGame.startSession') < begin.indexOf('this.transitionSession(SESSION_STATES.PLAYING'));
    assert.ok(begin.indexOf('await this.shell.hideAll') < begin.indexOf('this.runtime.resume'));
    assert.match(launch, /this\.firstPlayableFrame\.arm\(this\.activeGame, this\.rendererService\.presentedFrames\)/);
    assert.match(launch, /this\.firstPlayableFrame\.clear\(\)/);
});
