import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preloadCharacterRoster } from '../../../resources/js/game/performance/CharacterRosterStartup.js';

test('bundled static character roster never hits the remote endpoint', async () => {
    let requests = 0;
    const repo = { baseUrl: '/characters.json',
        list: () => { requests++; throw Error('unexpected request'); } };
    const doc = { querySelector: () => ({}) };
    assert.deepEqual(await preloadCharacterRoster(repo, { documentRef: doc }),
        { characters: [], error: null });
    assert.equal(requests, 0);
});

test('dynamic roster starts immediately and failure cannot become an unhandled rejection', async () => {
    let resolveRoster, started = 0;
    const rows = [{ slug: 'darya' }];
    const repo = { baseUrl: '/api/characters', list: () => {
        started++; return new Promise(resolve => { resolveRoster = resolve; });
    } };
    const inflight = preloadCharacterRoster(repo, { documentRef: null });
    assert.equal(started, 1, 'remote request must begin before heavy world setup');
    resolveRoster(rows);
    assert.deepEqual(await inflight, { characters: rows, error: null });
    const error = Error('timeout');
    const failed = await preloadCharacterRoster({
        baseUrl: '/api/characters', list: () => Promise.reject(error),
    }, { documentRef: null });
    assert.deepEqual(failed, { characters: [], error });
    assert.deepEqual(await preloadCharacterRoster({
        baseUrl: '/api/characters', list: () => { throw error; },
    }, { documentRef: null }), failed);
});

test('initial boot selects lite without changing default high-fidelity user selection', () => {
    const manager = readFileSync(new URL('../../../resources/js/game/managers/CharacterManager.js',
        import.meta.url), 'utf8');
    const boot = manager.slice(manager.indexOf('    async boot('),
        manager.indexOf('    ensureBuiltinCharacters()'));
    const selection = manager.slice(manager.indexOf('    async select('),
        manager.indexOf('    disposeEntity(', manager.indexOf('    async select(')));
    assert.match(boot, /initialVariant = this\.runtimeVariants\.active/);
    assert.match(boot, /variant: initialVariant/);
    assert.match(boot, /rosterPromise \?\? CharacterManager\.preloadRoster/);
    assert.match(selection, /variant = this\.runtimeVariants\.active/);
    assert.match(selection, /ensureEntity\(record, this\.entities\.size, \{ variant \}\)/);
    assert.match(manager, /variant: this\.runtimeVariants\.active, background/);
});

test('Open World renders the cafe before boot; streaming and visual upgrades follow the lite player', () => {
    const world = readFileSync(new URL('../../../resources/js/game/games/open-world/OpenWorldGame.js',
        import.meta.url), 'utf8');
    const app = readFileSync(new URL('../../../resources/js/game/application/GameApplication.js',
        import.meta.url), 'utf8');
    const roster = world.indexOf('preloadCharacterRoster(this.repository)');
    const systems = world.indexOf('this.setupWorldServices()');
    const bootstrap = world.indexOf("renderScene({ phase: 'bootstrap'");
    const boot = world.indexOf('await this.characterManager.boot(');
    const streaming = world.indexOf('this.updateStreaming(true)');
    const ready = world.indexOf("renderScene({ phase: 'ready'");
    const upgrade = world.indexOf('this.characterManager.startBackgroundHydration()');
    assert.ok(roster >= 0 && systems > roster && bootstrap > systems
        && boot > bootstrap && streaming > boot && ready > streaming && upgrade > ready);
    assert.doesNotMatch(world.slice(roster, boot), /chunkManager\.update\(this\.manifest\.spawn\)/);
    assert.match(world, /initialVariant: 'lite'/);
    assert.match(app, /criticalSpriteVariant\(gameId, this\.characterVisuals\)/);
});

test('asynchronous enhancement cannot mutate a disposed actor or leak its texture', () => {
    const manager = readFileSync(new URL('../../../resources/js/game/managers/CharacterManager.js',
        import.meta.url), 'utf8');
    const variant = manager.slice(manager.indexOf('    async ensureEntityVariant('),
        manager.indexOf('    async createEntity('));
    assert.match(variant, /if \(this\.disposed \|\| this\.entities\.get\(String\(record\.id\)\) !== entity/);
    assert.match(variant, /assets\.texture\?\.dispose\?\.\(\)/);
    assert.match(variant, /entity\.replaceVisualAssets\(assets\.texture, assets\.atlas\)/);
});
