import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createCabinetDefinitions,
    createOpenWorldCollisionManifest,
    OPEN_WORLD_DISTRICTS,
} from '../../../resources/js/game/world/OpenWorldManifest.js';

test('OpenWorld manifest creates deterministic cabinet, collider, trigger and interaction data', () => {
    const first = createCabinetDefinitions(0.8);
    const second = createCabinetDefinitions(0.8);
    assert.deepEqual(first, second);
    assert.equal(first.length, 14);
    assert.equal(new Set(first.map((cabinet) => cabinet.id)).size, first.length);
    assert.ok(first.some((cabinet) => cabinet.gameId === 'tetris'));
    const manifest = createOpenWorldCollisionManifest(first);
    assert.equal(manifest.staticColliders.length, first.length + 4);
    assert.equal(manifest.triggers.length, OPEN_WORLD_DISTRICTS.length);
});
