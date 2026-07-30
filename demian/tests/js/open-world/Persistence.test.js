import test from 'node:test';
import assert from 'node:assert/strict';
import OpenWorldSaveStore from '../../../resources/js/game/games/open-world/persistence/OpenWorldSaveStore.js';
import SavePointSystem from '../../../resources/js/game/games/open-world/persistence/SavePointSystem.js';
import WorldDiscovery from '../../../resources/js/game/games/open-world/world/WorldDiscovery.js';
import manifest from '../../../resources/js/game/games/open-world/data/DemianCityManifest.js';

function memoryStorage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

test('Open World save store persists checksummed state and rejects tampering', () => {
    const storage = memoryStorage();
    const store = new OpenWorldSaveStore({ storage, now: () => '2026-07-30T00:00:00.000Z' });
    store.save({ worldId: manifest.id, worldVersion: manifest.version, position: { x: 4, z: 4 } });
    assert.deepEqual(store.load({ worldId: manifest.id, maxWorldVersion: 1 }).position, { x: 4, z: 4 });
    const raw = JSON.parse(storage.getItem('demian.open-world.save.v1'));
    raw.state.position.x = 999;
    storage.setItem('demian.open-world.save.v1', JSON.stringify(raw));
    assert.equal(store.load({ worldId: manifest.id }), null);
});

test('save point activation unlocks fast travel and restores discovery', () => {
    const storage = memoryStorage();
    const discovery = new WorldDiscovery();
    const system = new SavePointSystem({
        manifest,
        discovery,
        store: new OpenWorldSaveStore({ storage }),
        stateProvider: () => ({ worldId: manifest.id, worldVersion: manifest.version, position: { x: -64, z: 0 } }),
    });
    system.activate('save-park');
    assert.equal(discovery.isSavePointUnlocked('save-park'), true);
    const restoredDiscovery = new WorldDiscovery();
    const restored = new SavePointSystem({ manifest, discovery: restoredDiscovery, store: new OpenWorldSaveStore({ storage }) });
    assert.ok(restored.restore());
    assert.equal(restoredDiscovery.isSavePointUnlocked('save-park'), true);
});

test('Open World save rejects a save produced by a newer manifest version', () => {
    const storage = memoryStorage();
    const store = new OpenWorldSaveStore({ storage });
    store.save({ worldId: manifest.id, worldVersion: 99, position: { x: 0, z: 0 } });
    assert.equal(store.load({ worldId: manifest.id, maxWorldVersion: manifest.version }), null);
});
