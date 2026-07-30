import test from 'node:test';
import assert from 'node:assert/strict';
import CollisionWorld from '../../../resources/js/game/shared/collision/CollisionWorld.js';
import InteractionService from '../../../resources/js/game/shared/interaction/InteractionService.js';
import { COLLISION_LAYERS } from '../../../resources/js/game/shared/collision/CollisionLayers.js';

test('InteractionService selects the best visible candidate by priority, distance and facing', () => {
    const collision = new CollisionWorld({ cellSize: 1 });
    const service = new InteractionService({ collisionWorld: collision });
    service.register({ id: 'near', position: { x: 1, z: 0 }, radius: 3, action: () => true });
    service.register({ id: 'priority', position: { x: 2, z: 0 }, radius: 3, priority: 1, action: () => true });
    const active = service.updateActor({ position: { x: 0, z: 0 }, forward: { x: 1, z: 0 } });
    assert.equal(active.id, 'priority');
});

test('InteractionService rejects candidates occluded by world geometry', () => {
    const collision = new CollisionWorld({ cellSize: 1 });
    const scope = collision.createScope('world');
    scope.addStaticAabb('wall', { x: 1, z: 0 }, { x: 0.2, z: 2 }, {
        layer: COLLISION_LAYERS.WORLD,
        mask: COLLISION_LAYERS.ALL,
    });
    const service = new InteractionService({ collisionWorld: collision });
    service.register({ id: 'behind-wall', position: { x: 2, z: 0 }, radius: 3, action: () => true });
    assert.equal(service.updateActor({ position: { x: 0, z: 0 }, forward: { x: 1, z: 0 } }), null);
});

test('InteractionService excludes the target own occluder and runs one action at a time', async () => {
    const collision = new CollisionWorld({ cellSize: 1 });
    const scope = collision.createScope('world');
    const cabinet = scope.addStaticAabb('cabinet', { x: 2, z: 0 }, { x: 0.5, z: 0.5 });
    let release;
    let calls = 0;
    const deferred = new Promise((resolve) => { release = resolve; });
    const service = new InteractionService({ collisionWorld: collision });
    service.register({
        id: 'cabinet-action',
        position: { x: 1.4, z: 0 },
        radius: 3,
        occluderId: cabinet.id,
        action: async () => { calls += 1; await deferred; return 'done'; },
    });
    service.updateActor({ position: { x: 0, z: 0 }, forward: { x: 1, z: 0 } });
    const first = service.interact('player');
    assert.equal(await service.interact('player'), false);
    release();
    assert.equal(await first, 'done');
    assert.equal(calls, 1);
});

test('Interaction scopes allow same local ids and clean active prompts on disposal', () => {
    const service = new InteractionService();
    const first = service.createScope('game');
    const second = service.createScope('game');
    first.register({ id: 'door', position: { x: 0, z: 0 }, action: () => true });
    second.register({ id: 'door', position: { x: 5, z: 0 }, action: () => true });
    assert.equal(service.stats().interactables, 2);
    service.updateActor({ actorId: 'player', position: { x: 0, z: 0 } });
    first.dispose();
    assert.equal(service.active('player'), null);
    assert.equal(service.stats().interactables, 1);
});

test('InteractionService does not prompt for an object behind the actor', () => {
    const service = new InteractionService();
    service.register({ id: 'behind', position: { x: -1, z: 0 }, radius: 2, action: () => true });
    assert.equal(
        service.updateActor({ position: { x: 0, z: 0 }, forward: { x: 1, z: 0 } }),
        null
    );
});
