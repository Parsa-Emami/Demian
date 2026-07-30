import { finiteNumber } from './CollisionMath.js';

export default class SpatialHash {
    constructor({ cellSize = 4 } = {}) {
        this.cellSize = Math.max(0.25, finiteNumber(cellSize, 4));
        this.cells = new Map();
        this.memberships = new Map();
    }

    key(x, z) {
        return `${x}:${z}`;
    }

    range(aabb) {
        return {
            minX: Math.floor(aabb.minX / this.cellSize),
            maxX: Math.floor(aabb.maxX / this.cellSize),
            minZ: Math.floor(aabb.minZ / this.cellSize),
            maxZ: Math.floor(aabb.maxZ / this.cellSize),
        };
    }

    keysForAabb(aabb) {
        const range = this.range(aabb);
        const keys = [];
        for (let x = range.minX; x <= range.maxX; x += 1) {
            for (let z = range.minZ; z <= range.maxZ; z += 1) keys.push(this.key(x, z));
        }
        return keys;
    }

    insert(collider) {
        this.remove(collider.id);
        const keys = this.keysForAabb(collider.aabb);
        keys.forEach((key) => {
            const cell = this.cells.get(key) ?? new Set();
            cell.add(collider.id);
            this.cells.set(key, cell);
        });
        this.memberships.set(collider.id, keys);
    }

    update(collider) {
        const previous = this.memberships.get(collider.id) ?? [];
        const next = this.keysForAabb(collider.aabb);
        if (previous.length === next.length && previous.every((key, index) => key === next[index])) return;
        this.insert(collider);
    }

    remove(id) {
        const keys = this.memberships.get(id);
        if (!keys) return false;
        keys.forEach((key) => {
            const cell = this.cells.get(key);
            cell?.delete(id);
            if (cell?.size === 0) this.cells.delete(key);
        });
        this.memberships.delete(id);
        return true;
    }

    query(aabb) {
        const ids = new Set();
        this.keysForAabb(aabb).forEach((key) => {
            this.cells.get(key)?.forEach((id) => ids.add(id));
        });
        return ids;
    }

    clear() {
        this.cells.clear();
        this.memberships.clear();
    }
}
