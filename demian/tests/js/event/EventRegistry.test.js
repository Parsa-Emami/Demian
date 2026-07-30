import test from 'node:test';
import assert from 'node:assert/strict';
import EventRegistry from '../../../resources/js/game/games/event/EventRegistry.js';

 test('EventRegistry lazily loads, validates and caches built-in definitions', async () => {
    const registry = new EventRegistry();
    assert.equal(registry.loader.get('cafe-rush'), null);
    const first = await registry.load('cafe-rush');
    const second = await registry.load('cafe-rush');
    assert.equal(first, second);
    assert.equal(Object.isFrozen(first), true);
    assert.deepEqual(registry.list().map((event) => event.id), ['cafe-rush', 'neon-collector', 'survival-night']);
});

test('EventRegistry rejects unknown event ids', async () => {
    await assert.rejects(() => new EventRegistry().load('missing-event'), /Unknown event/);
});

test('EventRegistry accepts API wrapped active definitions with a bounded remote loader', async () => {
    const registry = new EventRegistry({
        loader: new (await import('../../../resources/js/game/games/event/EventDefinitionLoader.js')).default({
            fetcher: async () => ({
                ok: true,
                json: async () => ({ data: structuredClone((await import('../../../resources/js/game/games/event/definitions/cafe-rush.json', { with: { type: 'json' } })).default) }),
            }),
        }),
    });
    const active = await registry.loadActive('/api/v1/events', { timeoutMs: 100 });
    assert.equal(active.id, 'cafe-rush');
    assert.equal(registry.has('cafe-rush'), true);
});
