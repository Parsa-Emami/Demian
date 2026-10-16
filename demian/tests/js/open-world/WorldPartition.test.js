import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';
import WorldPartition from '../../../resources/js/game/games/open-world/world/WorldPartition.js';

const partition = new WorldPartition(manifest);

test('world partition maps positions to chunks with manifest origin', () => {
    assert.equal(partition.chunkAt({ x: 0, z: 0 }).id, 'cafe-1-14');
    assert.equal(partition.chunkAt({ x: -12, z: -120 }).id, 'cafe-0-4');
    const center = partition.gridToWorld({ x: 1, z: 0 });
    assert.ok(Math.abs(center.x + 2.16) < 1e-9 && Math.abs(center.z + 168.24) < 1e-9);
    assert.deepEqual(partition.worldToGrid(center), { x: 1, z: 0 });
});

test('partition returns sorted streaming rings and clamps positions', () => {
    const ring = partition.chunksWithin({ x: 0, z: 0 }, 1);
    assert.equal(ring[0].distance, 0);
    assert.ok(ring.every(({ distance }) => distance <= 1));
    assert.deepEqual(partition.clampPosition({ x: -999, z: 999 }, 1), {
        x: manifest.bounds.minX + 1,
        z: manifest.bounds.maxZ - 1,
    });
});
