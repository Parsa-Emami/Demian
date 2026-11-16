import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CharacterManager from '../../../resources/js/game/managers/CharacterManager.js';

test('bundled static character roster never hits the remote endpoint', async () => {
    let requests = 0;
    const repo = { baseUrl: '/characters.json',
        list: () => { requests++; throw Error('unexpected request'); } };
    const doc = { querySelector: () => ({}) };
    assert.deepEqual(await CharacterManager.preloadRoster(repo, { documentRef: doc }),
        { characters: [], error: null });
    assert.equal(requests, 0);
});

test('dynamic roster starts immediately and failure cannot become an unhandled rejection', async () => {
    let resolveRoster, started = 0;
    const rows = [{ slug: 'darya' }];
    const repo = { baseUrl: '/api/characters', list: () => {
        started++; return new Promise(resolve => { resolveRoster = resolve; });
    } };
    const inflight = CharacterManager.preloadRoster(repo, { documentRef: null });
    assert.equal(started, 1, 'remote request must begin before heavy world setup');
    resolveRoster(rows);
    assert.deepEqual(await inflight, { characters: rows, error: null });
    const error = Error('timeout');
    const failed = await CharacterManager.preloadRoster({
        baseUrl: '/api/characters', list: () => Promise.reject(error),
    }, { documentRef: null });
    assert.deepEqual(failed, { characters: [], error });
    assert.deepEqual(await CharacterManager.preloadRoster({
        baseUrl: '/api/characters', list: () => { throw error; },
    }, { documentRef: null }), failed);
});

test('progressive boot selects only the necessary lite player before any NPC hydration', async () => {
    const options = [], events = [];
    const manager = Object.create(CharacterManager.prototype);
    manager.repository = { baseUrl: '/api/characters', list: async () => [] };
    manager.runtimeVariants = { active: 'detail', npc: 'lite' };
    manager.characters = [];
    manager.ensureBuiltinCharacters = () => {
        manager.characters = [{ id: 'builtin-darya', slug: 'darya', is_active: true }];
    };
    manager.select = async (id, settings) => options.push({ id, settings });
    manager.eventBus = { emit: event => events.push(event) };
    manager.emitRosterChanged = () => events.push('roster:changed');
    const rows = await manager.boot({ preferredSlug: 'darya', initialVariant: 'lite',
        rosterPromise: Promise.resolve({ characters: [], error: null }) });
    assert.equal(rows.length, 1);
    assert.deepEqual(options, [{ id: 'builtin-darya',
        settings: { preservePosition: false, hydrateRoster: false, variant: 'lite' } }]);
    assert.ok(events.includes('characters:changed'));
});

test('normal character selection still requests the original high-detail variant', async () => {
    const manager = Object.create(CharacterManager.prototype);
    manager.runtimeVariants = { active: 'detail', npc: 'lite' };
    manager.characters = [{ id: 7, slug: 'darya' }];
    manager.entities = new Map();
    manager.selectionGeneration = 0;
    manager.ensureEntity = async (_record, _index, { variant }) => {
        assert.equal(variant, 'detail'); throw Error('expected variant');
    };
    manager.eventBus = { emit() {} };
    await assert.rejects(manager.select(7), /expected variant/);
});

test('Open World renders the cafe before boot; streaming and visual upgrades follow the lite player', () => {
    const world = readFileSync(new URL('../../../resources/js/game/games/open-world/OpenWorldGame.js',
        import.meta.url), 'utf8');
    const app = readFileSync(new URL('../../../resources/js/game/application/GameApplication.js',
        import.meta.url), 'utf8');
    const roster = world.indexOf('CharacterManager.preloadRoster(this.repository)');
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

test('late quality upgrade disposes resources instead of touching a disposed entity', async () => {
    const manager = Object.create(CharacterManager.prototype);
    const record = { id: 'builtin-darya', slug: 'darya' };
    const entity = { runtimeSpriteVariant: 'lite', isPlayerControlled: true,
        replaceVisualAssets: () => { throw Error('stale replacement'); } };
    manager.activeEntity = entity;
    manager.entities = new Map([[record.id, entity]]);
    manager.disposed = false;
    let finish;
    manager.loadCharacterAssets = () => new Promise(resolve => { finish = resolve; });
    const upgrade = manager.ensureEntityVariant(record, entity, 'runtime', { background: true });
    manager.disposed = true;
    let disposed = 0;
    finish({ texture: { dispose() { disposed++; } }, atlas: {}, variant: 'runtime' });
    await upgrade;
    assert.equal(disposed, 1);
});
