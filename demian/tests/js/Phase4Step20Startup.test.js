import test from 'node:test';
import assert from 'node:assert/strict';
import GameApplication from '../../resources/js/game/application/GameApplication.js';
import BaseScreen from '../../resources/js/game/shell/screens/BaseScreen.js';
import { readFileSync } from 'node:fs';

function appHarness({ previous = null } = {}) {
    const log = [];
    const app = Object.create(GameApplication.prototype);
    app.disposed = false;
    app.bootPromise = null;
    app.activeGame = previous;
    app.activeGameId = previous ? 'dino-run' : null;
    app.activeDefinition = previous ? { title: 'Dino Run' } : null;
    app.paused = false;
    app.loadingTimings = [];
    app.root = { dataset: {} };
    app.eventBus = { emit: (event, detail) => log.push([event, detail]) };
    app.runtime = {
        paused: false,
        setGame: game => log.push(['setGame', game]),
        start: () => log.push(['runtime:start']),
        resume: () => log.push(['runtime:resume']),
    };
    app.shell = {
        boot: () => log.push(['shell:boot']),
        showBoot: async () => log.push(['shell:boot-screen']),
        setBootProgress: n => log.push(['progress', n]),
        showCafeMenu: async () => log.push(['menu:visible']),
    };
    app.controlLayouts = { boot: () => log.push(['controls:boot']) };
    app.animation = { boot: () => log.push(['animation:boot']) };
    app.input = { setContext: name => log.push(['context', name]) };
    app.transitionSession = state => log.push(['session', state]);
    app.applyRenderQuality = () => log.push(['quality:menu']);
    app.applyOrientationPreference = orientation => log.push(['orientation', orientation]);
    app.synchronizeUi = () => log.push(['sync']);
    app.performGameSwitch = () => {
        throw Error('A menu may never instantiate Open World');
    };
    return { app, log };
}

test('Step 20: first menu is reachable without any Open World, sprite or remote-character API loads', async () => {
    const { app, log } = appHarness();
    await app.boot();
    assert.equal(app.activeGame, null);
    assert.equal(app.activeGameId, null);
    assert.equal(app.root.dataset.activeGame, '');
    assert.ok(log.some(row => row[0] === 'menu:visible'));
    assert.ok(log.some(row => row[0] === 'runtime:start'));
    assert.equal(app.loadingTimings[0].type, 'menu');
    assert.ok(app.loadingTimings[0].durationMs >= 0);
    assert.ok(log.some(row => row[0] === 'application:boot-timing'));
    assert.equal(app.bootPromise instanceof Promise, true);
});

test('Step 20: menu appears before disposing a live game's potentially slow resources', async () => {
    const order = [];
    const previous = {
        exit: async () => { order.push('game:exit'); },
        dispose: () => order.push('game:dispose'),
    };
    const { app, log } = appHarness({ previous });
    const showCafeMenu = app.shell.showCafeMenu;
    app.shell.showCafeMenu = async () => {
        order.push('menu:visible');
        await showCafeMenu();
    };
    await app.enterMenuState();
    assert.deepEqual(order, ['menu:visible', 'game:exit', 'game:dispose']);
    assert.ok(log.some(row => row[0] === 'setGame' && row[1] === null));
    assert.equal(app.root.dataset.activeGame, '');
    assert.equal(app.activeGame, null);
    assert.equal(app.paused, false);
});

test('Step 20: failed game cleanup does not strand a player on the loading screen', async () => {
    const { app, log } = appHarness({ previous: {
        exit: async () => { throw Error('dispose handshake failed'); },
        dispose: () => log.push(['disposed:after-exit-error']),
    } });
    const warn = console.warn;
    console.warn = () => {};
    try { await app.enterMenuState(); }
    finally { console.warn = warn; }
    assert.ok(log.some(row => row[0] === 'menu:visible'));
    assert.ok(log.some(row => row[0] === 'disposed:after-exit-error'));
});

test('Step 20: no fixed animation delay for boot/loading; full modal accessibility stays intact', async () => {
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
        return screen;
    };
    for (const id of ['boot', 'loading']) {
        const screen = makeScreen(id);
        screen.focusInitialElement = () => {};
        await screen.open();
        await screen.close();
    }
    assert.deepEqual(durations, [0, 0, 0, 0]);
});

test('Step 20: game-specific load paths defer optional chunks and decorative artwork', () => {
    const world = readFileSync(new URL('../../resources/js/game/games/open-world/OpenWorldGame.js', import.meta.url), 'utf8');
    const crash = readFileSync(new URL('../../resources/js/game/games/coffee-crash/CoffeeCrashGame.js', import.meta.url), 'utf8');
    const index = world.indexOf("this.discovery.unlockSavePoint('save-entrance')");
    assert.ok(index > 0);
    assert.match(world.slice(index, index + 450), /this\.chunkManager\.update\(this\.manifest\.spawn\)/);
    assert.match(world, /await this\.chunkManager\.ensureAround\(this\.manifest\.spawn\)/,
        'ranked route must still ensure the exact starting geometry');
    assert.match(crash, /preload\(\)\s*\{\s*[\s\S]*?void preloadFbxCafeArt\(\)/);
    assert.doesNotMatch(crash, /preload\(\)\s*\{\s*return preloadFbxCafeArt\(\)/);
});
