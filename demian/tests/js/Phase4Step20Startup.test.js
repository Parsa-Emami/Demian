import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import BaseScreen from '../../resources/js/game/shell/screens/BaseScreen.js';

const app = readFileSync(new URL('../../resources/js/game/application/GameApplication.js', import.meta.url), 'utf8');
const world = readFileSync(new URL('../../resources/js/game/games/open-world/OpenWorldGame.js', import.meta.url), 'utf8');
const crash = readFileSync(new URL('../../resources/js/game/games/coffee-crash/CoffeeCrashGame.js', import.meta.url), 'utf8');

test('Step 20: first menu does not instantiate the Open World or await character API/atlas art', () => {
    const start = app.indexOf('    async boot() {');
    const end = app.indexOf('\n    showMenu(options', start);
    assert.ok(start >= 0 && end > start);
    const boot = app.slice(start, end);
    assert.doesNotMatch(boot, /await this\.performGameSwitch\(/);
    assert.match(boot, /this\.runtime\.start\(\)/);
    assert.match(boot, /await this\.enterMenuState\(\{ initial: true \}\)/);
    assert.match(boot, /application:boot-timing/);
});

test('Step 20: menu renders before slow resource disposal, and a failed exit hook cannot strand the UI', () => {
    const start = app.indexOf('    async enterMenuState(');
    const end = app.indexOf('\n    launchGame(', start);
    assert.ok(start >= 0 && end > start);
    const menu = app.slice(start, end);
    assert.doesNotMatch(menu, /await this\.performGameSwitch\(/);
    assert.match(menu, /this\.runtime\.setGame\(null\)/);
    assert.match(menu, /this\.activeGame = null/);
    assert.ok(menu.indexOf('await this.shell.showCafeMenu()') <
        menu.indexOf('await previousGame.exit()'),
        'The first usable menu frame must not wait for a slow exit hook.');
    assert.match(menu, /finally \{ previousGame\.dispose\(\); \}/);
});

test('Step 20: every launch records its actual duration, never stores personal data', () => {
    const start = app.indexOf('    launchGame('), end = app.indexOf('\n    async beginGameSession(', start);
    const source = app.slice(start, end);
    assert.match(source, /const loadingStartedAt/);
    assert.match(source, /game:load-timing/);
    assert.match(source, /durationMs/);
    assert.doesNotMatch(source, /localStorage|sendBeacon|fetch\(/);
    assert.match(app, /this\.loadingTimings\.length > 24/);
});

test('Step 20: loading and boot overlays add zero fixed 320/160ms waits', async () => {
    const durations = [];
    const makeScreen = id => {
        const animation = { animate: (_element, parameters) => {
            durations.push(parameters.duration);
            return {};
        }, finished: async () => {} };
        const element = {
            hidden: true, dataset: {}, setAttribute() {},
            querySelector: () => null,
        };
        const screen = Object.create(BaseScreen.prototype);
        Object.assign(screen, { id, element, animation, layer: 'primary', active: false });
        screen.focusInitialElement = () => {};
        return screen;
    };
    for (const id of ['boot', 'loading']) {
        const screen = makeScreen(id);
        await screen.open();
        await screen.close();
    }
    assert.deepEqual(durations, [0, 0, 0, 0]);
});

test('Step 20: all games use explicit deferred launch; ranked routes still gate their starting chunks', () => {
    const boot = app.slice(app.indexOf('    async boot() {'), app.indexOf('\n    showMenu(options'));
    assert.doesNotMatch(boot, /menuBackdrop: true/);
    const idx = world.indexOf("this.discovery.unlockSavePoint('save-entrance')");
    assert.ok(idx > 0);
    const bootAt = world.indexOf('await this.characterManager.boot(', idx);
    const readyAt = world.indexOf("renderScene({ phase: 'ready'", bootAt);
    assert.ok(bootAt > idx && readyAt > bootAt);
    assert.doesNotMatch(world.slice(idx, bootAt), /chunkManager\.update\(this\.manifest\.spawn\)/);
    assert.match(world.slice(bootAt, readyAt), /this\.updateStreaming\(true\)/,
        'Initial chunk streaming begins after the essential player, before gameplay.');
    assert.match(world, /await this\.chunkManager\.ensureAround\(this\.manifest\.spawn\)/,
        'Ranked World Route must still await its starting geometry.');
    assert.match(crash, /preload\(\)\s*\{\s*[\s\S]*?void preloadFbxCafeArt\(\)/);
    assert.doesNotMatch(crash, /preload\(\)\s*\{\s*return preloadFbxCafeArt\(\)/);
});
