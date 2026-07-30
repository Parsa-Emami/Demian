import test from 'node:test';
import assert from 'node:assert/strict';
import WorldDiscovery from '../../../resources/js/game/games/open-world/world/WorldDiscovery.js';

test('world discovery is idempotent and exports stable sorted state', () => {
    const discovery = new WorldDiscovery();
    assert.equal(discovery.discoverChunk('b'), true);
    assert.equal(discovery.discoverChunk('b'), false);
    discovery.discoverChunk('a');
    discovery.unlockSavePoint('save-z');
    discovery.unlockSavePoint('save-a');
    assert.deepEqual(discovery.export(), {
        discoveredChunks: ['a', 'b'],
        unlockedSavePoints: ['save-a', 'save-z'],
    });
});
