import test from 'node:test';
import assert from 'node:assert/strict';
import SpatialHash from '../../../resources/js/game/shared/collision/SpatialHash.js';
import Collider from '../../../resources/js/game/shared/collision/Collider.js';

test('SpatialHash inserts each collider once across overlapping cells', () => {
    const hash = new SpatialHash({ cellSize: 2 });
    const collider = new Collider({
        id: 'wide',
        shape: 'aabb',
        position: { x: 0, z: 0 },
        halfExtents: { x: 2.2, z: 2.2 },
    });
    hash.insert(collider);
    assert.deepEqual([...hash.query({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 })], ['wide']);
    assert.ok(hash.memberships.get('wide').length > 1);
});

test('SpatialHash updates memberships and removes empty cells', () => {
    const hash = new SpatialHash({ cellSize: 1 });
    const collider = new Collider({ id: 'moving', shape: 'circle', radius: 0.2 });
    hash.insert(collider);
    const oldCells = new Set(hash.memberships.get('moving'));
    collider.setPosition({ x: 8, z: 8 });
    hash.update(collider);
    assert.equal([...oldCells].some((key) => hash.cells.get(key)?.has('moving')), false);
    assert.equal(hash.query(collider.aabb).has('moving'), true);
    hash.remove('moving');
    assert.equal(hash.memberships.has('moving'), false);
});
