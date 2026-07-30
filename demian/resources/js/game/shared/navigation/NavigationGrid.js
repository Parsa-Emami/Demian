import PriorityQueue from './PriorityQueue.js';
import { circleIntersectsAabb, finiteNumber, point2 } from '../collision/CollisionMath.js';

export const NAVIGATION_CELL_TYPES = Object.freeze({
    WALKABLE: 'walkable',
    BLOCKED: 'blocked',
    SLOW: 'slow',
    DOOR: 'door',
    DANGER: 'danger',
    INTERACTABLE: 'interactable',
});

const DEFAULT_COSTS = Object.freeze({
    walkable: 1,
    blocked: Infinity,
    slow: 2.25,
    door: 1.25,
    danger: 4,
    interactable: 1,
});

function key(x, z) {
    return `${x}:${z}`;
}

function heuristic(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dz = Math.abs(a.z - b.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

export default class NavigationGrid {
    constructor({
        minX,
        maxX,
        minZ,
        maxZ,
        cellSize = 1,
        allowDiagonal = true,
        costs = {},
    } = {}) {
        this.minX = finiteNumber(minX, -10);
        this.maxX = finiteNumber(maxX, 10);
        this.minZ = finiteNumber(minZ, -10);
        this.maxZ = finiteNumber(maxZ, 10);
        this.cellSize = Math.max(0.25, finiteNumber(cellSize, 1));
        this.allowDiagonal = Boolean(allowDiagonal);
        this.width = Math.max(1, Math.ceil((this.maxX - this.minX) / this.cellSize));
        this.height = Math.max(1, Math.ceil((this.maxZ - this.minZ) / this.cellSize));
        this.costs = Object.freeze({ ...DEFAULT_COSTS, ...costs });
        this.cells = new Uint8Array(this.width * this.height);
        this.dynamicBlocks = new Map();
        this.typeToCode = new Map([
            [NAVIGATION_CELL_TYPES.WALKABLE, 0],
            [NAVIGATION_CELL_TYPES.BLOCKED, 1],
            [NAVIGATION_CELL_TYPES.SLOW, 2],
            [NAVIGATION_CELL_TYPES.DOOR, 3],
            [NAVIGATION_CELL_TYPES.DANGER, 4],
            [NAVIGATION_CELL_TYPES.INTERACTABLE, 5],
        ]);
        this.codeToType = [...this.typeToCode.keys()];
    }

    inBounds(x, z) {
        return x >= 0 && z >= 0 && x < this.width && z < this.height;
    }

    index(x, z) {
        return z * this.width + x;
    }

    worldToCell(position, { clamp = true } = {}) {
        const point = point2(position);
        let x = Math.floor((point.x - this.minX) / this.cellSize);
        let z = Math.floor((point.z - this.minZ) / this.cellSize);
        if (clamp) {
            x = Math.max(0, Math.min(this.width - 1, x));
            z = Math.max(0, Math.min(this.height - 1, z));
        }
        return { x, z };
    }

    cellToWorld(cell) {
        return {
            x: this.minX + (cell.x + 0.5) * this.cellSize,
            z: this.minZ + (cell.z + 0.5) * this.cellSize,
        };
    }

    setCell(x, z, type = NAVIGATION_CELL_TYPES.WALKABLE) {
        if (!this.inBounds(x, z)) return false;
        const code = this.typeToCode.get(type);
        if (code === undefined) throw new TypeError(`Unknown navigation cell type: ${type}`);
        this.cells[this.index(x, z)] = code;
        return true;
    }

    getCell(x, z) {
        if (!this.inBounds(x, z)) return NAVIGATION_CELL_TYPES.BLOCKED;
        return this.codeToType[this.cells[this.index(x, z)]] ?? NAVIGATION_CELL_TYPES.WALKABLE;
    }

    costAt(x, z) {
        if (!this.inBounds(x, z)) return Infinity;
        if (this.isDynamicallyBlocked(x, z)) return Infinity;
        return this.costs[this.getCell(x, z)] ?? 1;
    }

    isWalkable(x, z) {
        return Number.isFinite(this.costAt(x, z));
    }

    fillAabb(aabb, type = NAVIGATION_CELL_TYPES.BLOCKED, padding = 0) {
        const min = this.worldToCell({ x: aabb.minX - padding, z: aabb.minZ - padding });
        const max = this.worldToCell({ x: aabb.maxX + padding, z: aabb.maxZ + padding });
        for (let x = min.x; x <= max.x; x += 1) {
            for (let z = min.z; z <= max.z; z += 1) this.setCell(x, z, type);
        }
    }

    fillCircle(center, radius, type = NAVIGATION_CELL_TYPES.BLOCKED, padding = 0) {
        const resolvedRadius = Math.max(0, Number(radius) || 0) + padding;
        const min = this.worldToCell({ x: center.x - resolvedRadius, z: center.z - resolvedRadius });
        const max = this.worldToCell({ x: center.x + resolvedRadius, z: center.z + resolvedRadius });
        for (let x = min.x; x <= max.x; x += 1) {
            for (let z = min.z; z <= max.z; z += 1) {
                const point = this.cellToWorld({ x, z });
                if (Math.hypot(point.x - center.x, point.z - center.z) <= resolvedRadius + this.cellSize * 0.5) {
                    this.setCell(x, z, type);
                }
            }
        }
    }

    rasterizeColliders(colliders, { padding = 0.35, predicate = null } = {}) {
        colliders.forEach((collider) => {
            if (!collider.enabled || collider.sensor || collider.type !== 'static') return;
            if (predicate && !predicate(collider)) return;
            if (collider.shape === 'circle') this.fillCircle(collider.position, collider.radius, NAVIGATION_CELL_TYPES.BLOCKED, padding);
            else this.fillAabb(collider.aabb, NAVIGATION_CELL_TYPES.BLOCKED, padding);
        });
        return this;
    }

    setDynamicBlocker(id, { position, radius = 0.5 } = {}) {
        const center = this.worldToCell(position);
        const range = Math.max(0, Math.ceil((Number(radius) || 0.5) / this.cellSize));
        const cells = new Set();
        for (let x = center.x - range; x <= center.x + range; x += 1) {
            for (let z = center.z - range; z <= center.z + range; z += 1) {
                if (!this.inBounds(x, z)) continue;
                const world = this.cellToWorld({ x, z });
                const cellBox = {
                    minX: world.x - this.cellSize / 2,
                    maxX: world.x + this.cellSize / 2,
                    minZ: world.z - this.cellSize / 2,
                    maxZ: world.z + this.cellSize / 2,
                };
                if (circleIntersectsAabb(point2(position), radius, cellBox)) cells.add(key(x, z));
            }
        }
        this.dynamicBlocks.set(String(id), cells);
    }

    removeDynamicBlocker(id) {
        return this.dynamicBlocks.delete(String(id));
    }

    isDynamicallyBlocked(x, z) {
        const cellKey = key(x, z);
        for (const cells of this.dynamicBlocks.values()) {
            if (cells.has(cellKey)) return true;
        }
        return false;
    }

    neighbours(cell) {
        const offsets = this.allowDiagonal
            ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
            : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const result = [];
        offsets.forEach(([dx, dz]) => {
            const x = cell.x + dx;
            const z = cell.z + dz;
            if (!this.isWalkable(x, z)) return;
            if (dx !== 0 && dz !== 0) {
                if (!this.isWalkable(cell.x + dx, cell.z) || !this.isWalkable(cell.x, cell.z + dz)) return;
            }
            result.push({ x, z, diagonal: dx !== 0 && dz !== 0 });
        });
        return result;
    }

    nearestWalkable(cell, maxRadius = 8) {
        if (this.isWalkable(cell.x, cell.z)) return cell;
        for (let radius = 1; radius <= maxRadius; radius += 1) {
            for (let x = cell.x - radius; x <= cell.x + radius; x += 1) {
                for (const z of [cell.z - radius, cell.z + radius]) {
                    if (this.isWalkable(x, z)) return { x, z };
                }
            }
            for (let z = cell.z - radius + 1; z < cell.z + radius; z += 1) {
                for (const x of [cell.x - radius, cell.x + radius]) {
                    if (this.isWalkable(x, z)) return { x, z };
                }
            }
        }
        return null;
    }

    findPath(from, to, { maxIterations = 12000, smooth = true } = {}) {
        const rawStart = this.worldToCell(from);
        const rawGoal = this.worldToCell(to);
        const start = this.nearestWalkable(rawStart);
        const goal = this.nearestWalkable(rawGoal);
        if (!start || !goal) return [];

        const open = new PriorityQueue();
        const startKey = key(start.x, start.z);
        const goalKey = key(goal.x, goal.z);
        const cameFrom = new Map();
        const costSoFar = new Map([[startKey, 0]]);
        open.push(start, 0);
        let iterations = 0;

        while (open.size > 0 && iterations < maxIterations) {
            iterations += 1;
            const current = open.pop();
            const currentKey = key(current.x, current.z);
            if (currentKey === goalKey) break;

            this.neighbours(current).forEach((next) => {
                const nextKey = key(next.x, next.z);
                const stepCost = this.costAt(next.x, next.z) * (next.diagonal ? Math.SQRT2 : 1);
                const newCost = costSoFar.get(currentKey) + stepCost;
                if (newCost >= (costSoFar.get(nextKey) ?? Infinity)) return;
                costSoFar.set(nextKey, newCost);
                cameFrom.set(nextKey, current);
                open.push(next, newCost + heuristic(next, goal));
            });
        }

        if (startKey !== goalKey && !cameFrom.has(goalKey)) return [];
        const cells = [goal];
        let cursorKey = goalKey;
        while (cursorKey !== startKey) {
            const previous = cameFrom.get(cursorKey);
            if (!previous) return [];
            cells.push(previous);
            cursorKey = key(previous.x, previous.z);
        }
        cells.reverse();
        const path = cells.map((cell) => this.cellToWorld(cell));
        if (path.length > 0) {
            path[0] = point2(from);
            path[path.length - 1] = point2(to);
        }
        return smooth ? this.smoothPath(path) : path;
    }

    lineWalkable(from, to) {
        const start = point2(from);
        const end = point2(to);
        const distance = Math.hypot(end.x - start.x, end.z - start.z);
        const steps = Math.max(1, Math.ceil(distance / (this.cellSize * 0.35)));
        for (let index = 0; index <= steps; index += 1) {
            const t = index / steps;
            const cell = this.worldToCell({
                x: start.x + (end.x - start.x) * t,
                z: start.z + (end.z - start.z) * t,
            });
            if (!this.isWalkable(cell.x, cell.z)) return false;
        }
        return true;
    }

    smoothPath(path) {
        if (path.length <= 2) return path;
        const smoothed = [path[0]];
        let anchor = 0;
        while (anchor < path.length - 1) {
            let candidate = path.length - 1;
            while (candidate > anchor + 1 && !this.lineWalkable(path[anchor], path[candidate])) candidate -= 1;
            smoothed.push(path[candidate]);
            anchor = candidate;
        }
        return smoothed;
    }

    stats() {
        const counts = Object.fromEntries(Object.values(NAVIGATION_CELL_TYPES).map((type) => [type, 0]));
        for (let index = 0; index < this.cells.length; index += 1) {
            counts[this.codeToType[this.cells[index]]] += 1;
        }
        return Object.freeze({ width: this.width, height: this.height, cellSize: this.cellSize, ...counts });
    }
}
