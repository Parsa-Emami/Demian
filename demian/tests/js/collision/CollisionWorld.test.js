import test from 'node:test';
import assert from 'node:assert/strict';
import CollisionWorld from '../../../resources/js/game/shared/collision/CollisionWorld.js';
import { COLLISION_LAYERS } from '../../../resources/js/game/shared/collision/CollisionLayers.js';

function createWorld() {
    return new CollisionWorld({ cellSize: 1 });
}

test('CollisionWorld prevents tunnelling and slides a dynamic circle along a static AABB', () => {
    const world = createWorld();
    const scope = world.createScope('test');
    scope.addStaticAabb('wall', { x: 2, z: 0 }, { x: 0.2, z: 4 }, {
        layer: COLLISION_LAYERS.WORLD,
        mask: COLLISION_LAYERS.CHARACTER,
    });
    scope.addDynamicCircle('actor', { x: 0, z: 0 }, 0.5);

    const result = scope.moveCircle('actor', { x: 5, z: 2 });
    assert.ok(result.position.x <= 1.301, `actor crossed wall: ${result.position.x}`);
    assert.ok(result.position.z > 0.2, 'actor should preserve tangential motion');
    assert.equal(result.blockedX, true);
    assert.equal(result.collisions.length, 1);
});

test('CollisionWorld optionally resolves dynamic circle separation', () => {
    const world = createWorld();
    const scope = world.createScope('test');
    scope.addDynamicCircle('left', { x: 0, z: 0 }, 0.5);
    scope.addDynamicCircle('right', { x: 1.2, z: 0 }, 0.5);
    const result = scope.moveCircle('left', { x: 1.1, z: 0 }, { collideWithDynamic: true });
    assert.ok(result.position.x <= 0.201);
    assert.equal(result.collisions[0].collider.id.endsWith(':right'), true);
});

test('CollisionWorld raycast returns nearest hit and supports exclusions', () => {
    const world = createWorld();
    const scope = world.createScope('ray');
    const first = scope.addStaticAabb('first', { x: 2, z: 0 }, { x: 0.5, z: 0.5 });
    const second = scope.addStaticCircle('second', { x: 5, z: 0 }, 0.5);
    const hit = scope.raycast({ x: 0, z: 0 }, { x: 10, z: 0 });
    assert.equal(hit.collider.id, first.id);
    assert.ok(Math.abs(hit.point.x - 1.5) < 0.001);
    const excluded = scope.raycast({ x: 0, z: 0 }, { x: 10, z: 0 }, { exclude: [first.id] });
    assert.equal(excluded.collider.id, second.id);
});

test('CollisionWorld emits deterministic trigger enter, stay and exit phases', () => {
    const world = createWorld();
    const scope = world.createScope('trigger');
    scope.addDynamicCircle('actor', { x: 0, z: 0 }, 0.5);
    scope.addTriggerCircle('zone', { x: 2, z: 0 }, 1, {});

    assert.deepEqual(scope.updateTriggers('actor'), []);
    scope.sync('actor', { x: 1.5, z: 0 });
    assert.equal(scope.updateTriggers('actor')[0].phase, 'enter');
    assert.equal(scope.updateTriggers('actor')[0].phase, 'stay');
    scope.sync('actor', { x: 5, z: 0 });
    assert.equal(scope.updateTriggers('actor')[0].phase, 'exit');
});

test('Collision scopes isolate ownership and dispose only their colliders', () => {
    const world = createWorld();
    const previous = world.createScope('game');
    const next = world.createScope('game');
    previous.addStaticCircle('shared-name', { x: 0, z: 0 }, 1);
    next.addStaticCircle('shared-name', { x: 5, z: 0 }, 1);
    assert.equal(world.stats().total, 2);
    next.dispose();
    assert.equal(world.stats().total, 1);
    assert.ok(previous.get('shared-name'));
});
