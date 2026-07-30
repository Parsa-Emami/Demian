import Collider from './Collider.js';
import SpatialHash from './SpatialHash.js';
import { COLLISION_LAYERS } from './CollisionLayers.js';
import {
    aabbsOverlap,
    circleAabb,
    circleIntersectsAabb,
    circleVsAabbPenetration,
    circleVsCirclePenetration,
    circlesOverlap,
    mergeAabbs,
    point2,
    segmentAabbIntersection,
    segmentCircleIntersection,
} from './CollisionMath.js';

function shapeOverlap(left, right) {
    if (left.shape === 'circle' && right.shape === 'circle') {
        return circlesOverlap(left.position, left.radius, right.position, right.radius);
    }
    if (left.shape === 'circle') {
        return circleIntersectsAabb(left.position, left.radius, right.aabb);
    }
    if (right.shape === 'circle') {
        return circleIntersectsAabb(right.position, right.radius, left.aabb);
    }
    return aabbsOverlap(left.aabb, right.aabb);
}

function penetrationForCircle(circle, obstacle) {
    if (obstacle.shape === 'circle') {
        return circleVsCirclePenetration(
            circle.position,
            circle.radius,
            obstacle.position,
            obstacle.radius
        );
    }
    return circleVsAabbPenetration(circle.position, circle.radius, obstacle.aabb);
}

class CollisionScope {
    constructor(world, owner) {
        this.world = world;
        this.owner = owner;
        this.ids = new Set();
        this.disposed = false;
    }

    qualify(id) {
        const value = String(id ?? '').trim();
        if (!value) throw new TypeError('Scoped collider id is required.');
        return `${this.owner}:${value}`;
    }

    add(definition) {
        if (this.disposed) throw new Error('Collision scope is disposed.');
        const collider = this.world.add({ ...definition, id: this.qualify(definition.id), owner: this.owner });
        this.ids.add(collider.id);
        return collider;
    }

    addStaticAabb(id, position, halfExtents, options = {}) {
        return this.add({ id, type: 'static', shape: 'aabb', position, halfExtents, ...options });
    }

    addStaticCircle(id, position, radius, options = {}) {
        return this.add({ id, type: 'static', shape: 'circle', position, radius, ...options });
    }

    addDynamicCircle(id, position, radius, options = {}) {
        return this.add({
            id,
            type: 'dynamic',
            shape: 'circle',
            position,
            radius,
            layer: COLLISION_LAYERS.CHARACTER,
            mask: COLLISION_LAYERS.WORLD | COLLISION_LAYERS.CHARACTER | COLLISION_LAYERS.TRIGGER,
            ...options,
        });
    }

    addTriggerAabb(id, position, halfExtents, options = {}) {
        return this.add({
            id,
            type: 'trigger',
            shape: 'aabb',
            position,
            halfExtents,
            layer: COLLISION_LAYERS.TRIGGER,
            mask: COLLISION_LAYERS.CHARACTER,
            ...options,
        });
    }

    addTriggerCircle(id, position, radius, options = {}) {
        return this.add({
            id,
            type: 'trigger',
            shape: 'circle',
            position,
            radius,
            layer: COLLISION_LAYERS.TRIGGER,
            mask: COLLISION_LAYERS.CHARACTER,
            ...options,
        });
    }

    get(id) {
        return this.world.get(this.qualify(id));
    }

    remove(id) {
        const qualified = this.qualify(id);
        this.ids.delete(qualified);
        return this.world.remove(qualified);
    }

    sync(id, position) {
        return this.world.sync(this.qualify(id), position);
    }

    moveCircle(id, target, options = {}) {
        return this.world.moveCircle(this.qualify(id), target, options);
    }

    queryAabb(aabb, options = {}) {
        return this.world.queryAabb(aabb, options);
    }

    queryCircle(center, radius, options = {}) {
        return this.world.queryCircle(center, radius, options);
    }

    raycast(from, to, options = {}) {
        return this.world.raycast(from, to, options);
    }

    updateTriggers(id) {
        return this.world.updateTriggers(this.qualify(id));
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        [...this.ids].forEach((id) => this.world.remove(id));
        this.ids.clear();
    }
}

export default class CollisionWorld {
    constructor({ cellSize = 4, eventBus = null } = {}) {
        this.hash = new SpatialHash({ cellSize });
        this.colliders = new Map();
        this.triggerContacts = new Map();
        this.eventBus = eventBus;
        this.scopeCounter = 0;
    }

    createScope(owner = 'scope') {
        const normalized = String(owner || 'scope').replace(/[^a-z0-9_-]+/gi, '-');
        this.scopeCounter += 1;
        return new CollisionScope(this, `${normalized}-${this.scopeCounter}`);
    }

    add(definition) {
        const collider = definition instanceof Collider ? definition : new Collider(definition);
        if (this.colliders.has(collider.id)) throw new Error(`Collider already exists: ${collider.id}`);
        this.colliders.set(collider.id, collider);
        if (collider.enabled) this.hash.insert(collider);
        this.eventBus?.emit('collision:collider-added', { collider });
        return collider;
    }

    get(id) {
        return this.colliders.get(id) ?? null;
    }

    remove(id) {
        const collider = this.colliders.get(id);
        if (!collider) return false;
        this.hash.remove(id);
        this.colliders.delete(id);
        this.triggerContacts.delete(id);
        this.triggerContacts.forEach((contacts) => contacts.delete(id));
        this.eventBus?.emit('collision:collider-removed', { collider });
        return true;
    }

    sync(id, position) {
        const collider = this.get(id);
        if (!collider) return null;
        collider.setPosition(position);
        if (collider.enabled) this.hash.update(collider);
        return collider;
    }

    setEnabled(id, enabled) {
        const collider = this.get(id);
        if (!collider) return false;
        collider.enabled = Boolean(enabled);
        if (collider.enabled) this.hash.insert(collider);
        else this.hash.remove(collider.id);
        return true;
    }

    matches(collider, { mask = COLLISION_LAYERS.ALL, types = null, exclude = null } = {}) {
        if (!collider?.enabled) return false;
        if ((collider.layer & mask) === 0) return false;
        if (types && !types.includes(collider.type)) return false;
        if (exclude && exclude.has(collider.id)) return false;
        return true;
    }

    queryAabb(aabb, options = {}) {
        const exclude = new Set(options.exclude ?? []);
        return [...this.hash.query(aabb)]
            .map((id) => this.colliders.get(id))
            .filter((collider) => this.matches(collider, { ...options, exclude }))
            .filter((collider) => aabbsOverlap(aabb, collider.aabb));
    }

    queryCircle(center, radius, options = {}) {
        const probe = { position: point2(center), radius: Math.max(0.001, Number(radius) || 0.001) };
        return this.queryAabb(circleAabb(probe.position, probe.radius), options)
            .filter((collider) => collider.shape === 'circle'
                ? circlesOverlap(probe.position, probe.radius, collider.position, collider.radius)
                : circleIntersectsAabb(probe.position, probe.radius, collider.aabb));
    }

    moveCircle(id, target, {
        collideWithDynamic = false,
        maxIterations = 6,
        maxSubstep = null,
        skin = 0.0001,
    } = {}) {
        const collider = this.get(id);
        if (!collider || collider.shape !== 'circle') {
            throw new Error(`Dynamic circle collider not found: ${id}`);
        }

        const start = { ...collider.position };
        const destination = point2(target);
        const dx = destination.x - start.x;
        const dz = destination.z - start.z;
        const distance = Math.hypot(dx, dz);
        const stepLength = Math.max(0.05, Number(maxSubstep) || collider.radius * 0.5);
        const steps = Math.max(1, Math.ceil(distance / stepLength));
        const collisions = new Map();
        let blockedX = false;
        let blockedZ = false;

        const stepX = dx / steps;
        const stepZ = dz / steps;
        for (let step = 1; step <= steps; step += 1) {
            collider.position.x += stepX;
            collider.position.z += stepZ;

            for (let iteration = 0; iteration < maxIterations; iteration += 1) {
                const candidates = this.queryAabb(collider.aabb, {
                    mask: collider.mask,
                    types: collideWithDynamic ? ['static', 'dynamic'] : ['static'],
                    exclude: [collider.id],
                }).filter((other) => collider.canCollideWith(other) && !other.sensor);

                let deepest = null;
                let obstacle = null;
                candidates.forEach((candidate) => {
                    const penetration = penetrationForCircle(collider, candidate);
                    if (penetration && (!deepest || penetration.depth > deepest.depth)) {
                        deepest = penetration;
                        obstacle = candidate;
                    }
                });

                if (!deepest || !obstacle) break;
                collider.position.x += deepest.x + deepest.normal.x * skin;
                collider.position.z += deepest.z + deepest.normal.z * skin;
                blockedX ||= Math.abs(deepest.normal.x) > 0.45;
                blockedZ ||= Math.abs(deepest.normal.z) > 0.45;
                collisions.set(obstacle.id, {
                    collider: obstacle,
                    normal: deepest.normal,
                    depth: deepest.depth,
                });
            }
        }

        this.hash.update(collider);
        const result = {
            start,
            requested: destination,
            position: { ...collider.position },
            delta: { x: collider.position.x - start.x, z: collider.position.z - start.z },
            blockedX,
            blockedZ,
            collisions: [...collisions.values()],
        };
        if (result.collisions.length > 0) {
            this.eventBus?.emit('collision:resolved', { actor: collider, result });
        }
        return result;
    }

    raycast(from, to, {
        mask = COLLISION_LAYERS.WORLD | COLLISION_LAYERS.CHARACTER,
        types = ['static', 'dynamic'],
        exclude = [],
        predicate = null,
    } = {}) {
        const origin = point2(from);
        const target = point2(to);
        const broadphase = mergeAabbs(
            { minX: origin.x, maxX: origin.x, minZ: origin.z, maxZ: origin.z },
            { minX: target.x, maxX: target.x, minZ: target.z, maxZ: target.z }
        );
        let nearest = null;

        this.queryAabb(broadphase, { mask, types, exclude }).forEach((collider) => {
            if (predicate && !predicate(collider)) return;
            const hit = collider.shape === 'circle'
                ? segmentCircleIntersection(origin, target, collider.position, collider.radius)
                : segmentAabbIntersection(origin, target, collider.aabb);
            if (!hit || (nearest && hit.fraction >= nearest.fraction)) return;
            nearest = { ...hit, collider };
        });

        return nearest;
    }

    updateTriggers(actorId) {
        const actor = this.get(actorId);
        if (!actor?.enabled) return [];
        const previous = this.triggerContacts.get(actorId) ?? new Set();
        const current = new Set();
        const events = [];

        this.queryAabb(actor.aabb, {
            mask: COLLISION_LAYERS.TRIGGER,
            types: ['trigger'],
            exclude: [actor.id],
        }).forEach((trigger) => {
            if (!actor.canCollideWith(trigger) || !shapeOverlap(actor, trigger)) return;
            current.add(trigger.id);
            const phase = previous.has(trigger.id) ? 'stay' : 'enter';
            const event = { phase, actor, trigger };
            events.push(event);
            this.eventBus?.emit(`collision:trigger-${phase}`, event);
            trigger.userData?.onTrigger?.(event);
        });

        previous.forEach((triggerId) => {
            if (current.has(triggerId)) return;
            const trigger = this.get(triggerId);
            if (!trigger) return;
            const event = { phase: 'exit', actor, trigger };
            events.push(event);
            this.eventBus?.emit('collision:trigger-exit', event);
            trigger.userData?.onTrigger?.(event);
        });

        this.triggerContacts.set(actorId, current);
        return events;
    }

    clear() {
        this.hash.clear();
        this.colliders.clear();
        this.triggerContacts.clear();
    }

    stats() {
        const result = { total: this.colliders.size, static: 0, dynamic: 0, trigger: 0, cells: this.hash.cells.size };
        this.colliders.forEach((collider) => { result[collider.type] += 1; });
        return Object.freeze(result);
    }

    dispose() {
        this.clear();
        this.eventBus = null;
    }
}
