import { COLLISION_LAYERS } from './CollisionLayers.js';
import { aabbFromCenter, circleAabb, finiteNumber, point2 } from './CollisionMath.js';

const TYPES = new Set(['static', 'dynamic', 'trigger']);
const SHAPES = new Set(['aabb', 'circle']);

export default class Collider {
    constructor({
        id,
        type = 'static',
        shape = 'aabb',
        position = { x: 0, z: 0 },
        halfExtents = { x: 0.5, z: 0.5 },
        radius = 0.5,
        layer = COLLISION_LAYERS.WORLD,
        mask = COLLISION_LAYERS.ALL,
        enabled = true,
        sensor = false,
        userData = null,
        owner = 'global',
    } = {}) {
        if (!id || typeof id !== 'string') throw new TypeError('Collider requires a string id.');
        if (!TYPES.has(type)) throw new TypeError(`Unsupported collider type: ${type}`);
        if (!SHAPES.has(shape)) throw new TypeError(`Unsupported collider shape: ${shape}`);

        this.id = id;
        this.type = type;
        this.shape = shape;
        this.position = point2(position);
        this.halfExtents = {
            x: Math.max(0.001, finiteNumber(halfExtents?.x, 0.5)),
            z: Math.max(0.001, finiteNumber(halfExtents?.z, 0.5)),
        };
        this.radius = Math.max(0.001, finiteNumber(radius, 0.5));
        this.layer = Number(layer) || COLLISION_LAYERS.NONE;
        this.mask = Number(mask) || COLLISION_LAYERS.NONE;
        this.enabled = Boolean(enabled);
        this.sensor = Boolean(sensor || type === 'trigger');
        this.userData = userData;
        this.owner = owner;
    }

    get aabb() {
        return this.shape === 'circle'
            ? circleAabb(this.position, this.radius)
            : aabbFromCenter(this.position, this.halfExtents);
    }

    setPosition(position) {
        const next = point2(position);
        this.position.x = next.x;
        this.position.z = next.z;
        return this;
    }

    canCollideWith(other) {
        return Boolean(
            this.enabled &&
            other?.enabled &&
            (this.mask & other.layer) !== 0 &&
            (other.mask & this.layer) !== 0
        );
    }
}
