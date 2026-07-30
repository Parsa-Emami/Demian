function point(value) {
    return { x: Number(value?.x) || 0, z: Number(value?.z) || 0 };
}

export default class HideSpotSystem {
    constructor(spots = []) {
        this.spots = new Map();
        this.occupants = new Map();
        this.byActor = new Map();
        spots.forEach((spot) => this.register(spot));
    }

    register(definition) {
        const id = String(definition?.id ?? '').trim();
        if (!id) throw new TypeError('Hide spot id is required.');
        if (this.spots.has(id)) throw new Error(`Hide spot already exists: ${id}`);
        const spot = Object.freeze({
            id,
            position: Object.freeze(point(definition.position)),
            exitPosition: Object.freeze(point(definition.exitPosition ?? definition.position)),
            radius: Math.max(0.2, Number(definition.radius) || 1.5),
            capacity: Math.max(1, Math.floor(Number(definition.capacity) || 1)),
            concealment: Math.max(0, Math.min(1, Number(definition.concealment) || 0)),
            entryDirection: definition.entryDirection ?? null,
            animation: definition.animation ?? 'crouch',
            label: String(definition.label ?? 'مخفیگاه'),
            metadata: Object.freeze({ ...(definition.metadata ?? {}) }),
        });
        this.spots.set(id, spot);
        this.occupants.set(id, new Set());
        return spot;
    }

    get(id) {
        return this.spots.get(String(id)) ?? null;
    }

    occupancy(id) {
        return this.occupants.get(String(id))?.size ?? 0;
    }

    available(id) {
        const spot = this.get(id);
        return Boolean(spot && this.occupancy(id) < spot.capacity);
    }

    enter(actorId, spotId) {
        const actor = String(actorId);
        const spot = this.get(spotId);
        if (!spot || !this.available(spot.id)) return null;
        this.exit(actor);
        this.occupants.get(spot.id).add(actor);
        this.byActor.set(actor, spot.id);
        return Object.freeze({ spot, position: spot.position, concealment: spot.concealment });
    }

    exit(actorId) {
        const actor = String(actorId);
        const spotId = this.byActor.get(actor);
        if (!spotId) return null;
        this.byActor.delete(actor);
        this.occupants.get(spotId)?.delete(actor);
        const spot = this.get(spotId);
        return spot ? Object.freeze({ spot, position: spot.exitPosition }) : null;
    }

    reveal(spotId) {
        const id = String(spotId);
        const actors = [...(this.occupants.get(id) ?? [])];
        actors.forEach((actorId) => this.byActor.delete(actorId));
        this.occupants.get(id)?.clear();
        return actors;
    }

    spotForActor(actorId) {
        return this.get(this.byActor.get(String(actorId)));
    }

    nearest(position, { maxDistance = Infinity, requireAvailable = false } = {}) {
        const origin = point(position);
        let selected = null;
        let selectedDistance = maxDistance;
        this.spots.forEach((spot) => {
            if (requireAvailable && !this.available(spot.id)) return;
            const distance = Math.hypot(spot.position.x - origin.x, spot.position.z - origin.z);
            if (distance < selectedDistance) {
                selected = spot;
                selectedDistance = distance;
            }
        });
        return selected ? Object.freeze({ spot: selected, distance: selectedDistance }) : null;
    }

    snapshot() {
        return Object.freeze([...this.spots.values()].map((spot) => Object.freeze({
            ...spot,
            occupancy: this.occupancy(spot.id),
            occupants: Object.freeze([...(this.occupants.get(spot.id) ?? [])]),
        })));
    }

    clear() {
        this.occupants.forEach((actors) => actors.clear());
        this.byActor.clear();
    }
}
