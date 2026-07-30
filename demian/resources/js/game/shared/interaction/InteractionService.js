import { COLLISION_LAYERS } from '../collision/CollisionLayers.js';
import { point2 } from '../collision/CollisionMath.js';

function normalizeForward(forward) {
    const x = Number(forward?.x) || 0;
    const z = Number(forward?.z) || 0;
    const length = Math.hypot(x, z);
    return length > 0.0001 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

class InteractionScope {
    constructor(service, owner) {
        this.service = service;
        this.owner = owner;
        this.ids = new Set();
        this.disposed = false;
    }

    qualify(id) {
        const value = String(id ?? '').trim();
        if (!value) throw new TypeError('Interactable id is required.');
        return `${this.owner}:${value}`;
    }

    register(definition) {
        if (this.disposed) throw new Error('Interaction scope is disposed.');
        const interactable = this.service.register({
            ...definition,
            id: this.qualify(definition.id),
            owner: this.owner,
        });
        this.ids.add(interactable.id);
        return interactable;
    }

    unregister(id) {
        const qualified = this.qualify(id);
        this.ids.delete(qualified);
        return this.service.unregister(qualified);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        [...this.ids].forEach((id) => this.service.unregister(id));
        this.ids.clear();
    }
}

export default class InteractionService {
    constructor({ eventBus = null, collisionWorld = null } = {}) {
        this.eventBus = eventBus;
        this.collisionWorld = collisionWorld;
        this.interactables = new Map();
        this.activeByActor = new Map();
        this.runningByActor = new Map();
        this.scopeCounter = 0;
    }

    createScope(owner = 'interaction') {
        const normalized = String(owner || 'interaction').replace(/[^a-z0-9_-]+/gi, '-');
        this.scopeCounter += 1;
        return new InteractionScope(this, `${normalized}-${this.scopeCounter}`);
    }

    register({
        id,
        position,
        radius = 2.4,
        label = 'تعامل',
        hint = '',
        priority = 0,
        facingWeight = 0.7,
        minimumFacing = -0.35,
        requireLineOfSight = true,
        occluderId = null,
        enabled = true,
        action,
        metadata = null,
        owner = 'global',
    } = {}) {
        if (!id || typeof id !== 'string') throw new TypeError('Interactable requires a string id.');
        if (typeof action !== 'function') throw new TypeError(`Interactable "${id}" requires an action.`);
        if (this.interactables.has(id)) throw new Error(`Interactable already exists: ${id}`);
        const interactable = {
            id,
            owner,
            position: point2(position),
            radius: Math.max(0.1, Number(radius) || 2.4),
            label: String(label || 'تعامل'),
            hint: String(hint || ''),
            priority: Number(priority) || 0,
            facingWeight: Math.max(0, Number(facingWeight) || 0),
            minimumFacing: Math.max(-1, Math.min(1, Number(minimumFacing) || 0)),
            requireLineOfSight: Boolean(requireLineOfSight),
            occluderId,
            enabled: Boolean(enabled),
            action,
            metadata,
        };
        this.interactables.set(id, interactable);
        this.eventBus?.emit('interaction:registered', { interactable });
        return interactable;
    }

    unregister(id) {
        const interactable = this.interactables.get(id);
        if (!interactable) return false;
        this.interactables.delete(id);
        this.activeByActor.forEach((active, actorId) => {
            if (active?.id === id) this.setActive(actorId, null);
        });
        this.eventBus?.emit('interaction:unregistered', { interactable });
        return true;
    }

    setEnabled(id, enabled) {
        const interactable = this.interactables.get(id);
        if (!interactable) return false;
        interactable.enabled = Boolean(enabled);
        return true;
    }

    candidateScore(interactable, actorPosition, forward) {
        const dx = interactable.position.x - actorPosition.x;
        const dz = interactable.position.z - actorPosition.z;
        const distance = Math.hypot(dx, dz);
        if (distance > interactable.radius) return null;
        const direction = distance > 0.0001 ? { x: dx / distance, z: dz / distance } : { x: 0, z: 0 };
        const facing = forward.x === 0 && forward.z === 0
            ? 1
            : Math.max(-1, Math.min(1, forward.x * direction.x + forward.z * direction.z));
        if (facing < interactable.minimumFacing) return null;
        return interactable.priority * 100 - distance + facing * interactable.facingWeight;
    }

    isOccluded(interactable, actorPosition, exclude = []) {
        if (!interactable.requireLineOfSight || !this.collisionWorld) return false;
        const ignored = new Set(exclude);
        if (interactable.occluderId) ignored.add(interactable.occluderId);
        const hit = this.collisionWorld.raycast(actorPosition, interactable.position, {
            mask: COLLISION_LAYERS.WORLD,
            types: ['static'],
            exclude: [...ignored],
        });
        return Boolean(hit && hit.fraction < 0.98);
    }

    updateActor({ actorId = 'player', position, forward = null, excludeOccluders = [] } = {}) {
        const actorPosition = point2(position);
        const direction = normalizeForward(forward);
        let selected = null;
        let selectedScore = -Infinity;

        this.interactables.forEach((interactable) => {
            if (!interactable.enabled) return;
            const score = this.candidateScore(interactable, actorPosition, direction);
            if (score === null || score <= selectedScore) return;
            if (this.isOccluded(interactable, actorPosition, excludeOccluders)) return;
            selected = interactable;
            selectedScore = score;
        });

        this.setActive(actorId, selected);
        return selected;
    }

    setActive(actorId, interactable) {
        const previous = this.activeByActor.get(actorId) ?? null;
        if (previous?.id === interactable?.id) return;
        if (interactable) this.activeByActor.set(actorId, interactable);
        else this.activeByActor.delete(actorId);
        this.eventBus?.emit('interaction:prompt-changed', {
            actorId,
            previous,
            interactable,
            visible: Boolean(interactable),
        });
    }

    active(actorId = 'player') {
        return this.activeByActor.get(actorId) ?? null;
    }

    async interact(actorId = 'player', context = {}) {
        const interactable = this.active(actorId);
        if (!interactable || this.runningByActor.has(actorId)) return false;
        const operation = Promise.resolve().then(() => interactable.action({
            actorId,
            interactable,
            metadata: interactable.metadata,
            ...context,
        }));
        this.runningByActor.set(actorId, operation);
        this.eventBus?.emit('interaction:started', { actorId, interactable });
        try {
            const result = await operation;
            this.eventBus?.emit('interaction:completed', { actorId, interactable, result });
            return result ?? true;
        } catch (error) {
            this.eventBus?.emit('interaction:failed', { actorId, interactable, error });
            throw error;
        } finally {
            if (this.runningByActor.get(actorId) === operation) this.runningByActor.delete(actorId);
        }
    }

    clearActor(actorId = 'player') {
        this.setActive(actorId, null);
        this.runningByActor.delete(actorId);
    }

    stats() {
        return Object.freeze({
            interactables: this.interactables.size,
            activeActors: this.activeByActor.size,
            running: this.runningByActor.size,
        });
    }

    dispose() {
        this.interactables.clear();
        this.activeByActor.clear();
        this.runningByActor.clear();
        this.eventBus = null;
        this.collisionWorld = null;
    }
}
