import { cafeRoomAt } from '../../../shared/cafe/CafeWalkthroughScene.js';

function randomFromSeed(seed) {
    let state = (Number(seed) >>> 0) || 1;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function clearOfObstacles(point, obstacles, margin = 1.2) {
    return obstacles.every(({ position, halfExtents }) =>
        Math.abs(point.x - position.x) > halfExtents.x + margin
        || Math.abs(point.z - position.z) > halfExtents.z + margin);
}

export function generateWorldFind(chunk, manifest, navigationGrid = null) {
    if (!chunk || !manifest?.bounds || !chunk.bounds) return null;
    const random = randomFromSeed(chunk.seed);
    const area = chunk.bounds;
    const boundary = manifest.bounds;
    const inset = 1.4;
    const minX = Math.max(area.minX + inset, boundary.minX + inset);
    const maxX = Math.min(area.maxX - inset, boundary.maxX - inset);
    const minZ = Math.max(area.minZ + inset, boundary.minZ + inset);
    const maxZ = Math.min(area.maxZ - inset, boundary.maxZ - inset);
    if (!(minX < maxX && minZ < maxZ)) return null;
    const kind = random() < .66 ? 'coffee-bean' : 'postcard';
    const clearance = [manifest.spawn, ...manifest.savePoints.map(({ position }) => position)];
    for (let attempt = 0; attempt < 12; attempt++) {
        const point = {
            x: Math.round((minX + random() * (maxX - minX)) * 100) / 100,
            z: Math.round((minZ + random() * (maxZ - minZ)) * 100) / 100,
        };
        if (!cafeRoomAt(point)
            || clearance.some(position => Math.hypot(point.x - position.x, point.z - position.z) < 2.2)
            || !clearOfObstacles(point, chunk.obstacles ?? [])) continue;
        if (navigationGrid) {
            const cell = navigationGrid.worldToCell(point);
            if (!navigationGrid.isWalkable(cell.x, cell.z)
                || !navigationGrid.findPath(manifest.spawn, point).length) continue;
        }
        return Object.freeze({
            id: chunk.id + ':find',
            chunkId: chunk.id,
            kind,
            position: Object.freeze(point),
        });
    }
    return null;
}

export default class WorldFindCollection {
    constructor(manifest, saved = []) {
        this.manifest = manifest;
        this.collected = new Set();
        this.restore(saved);
    }

    restore(saved) {
        this.collected.clear();
        if (!Array.isArray(saved)) return;
        for (const id of saved.slice(0, this.manifest.chunks.length)) {
            if (typeof id !== 'string' || !id.endsWith(':find')) continue;
            const chunkId = id.slice(0, -5);
            if (this.manifest.chunk(chunkId)) this.collected.add(id);
        }
    }

    collect(position, loadedChunks, { active = true, radius = 1.15 } = {}) {
        if (!active || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return [];
        const taken = [];
        for (const record of loadedChunks.values()) {
            if (record.tier !== 'active') continue;
            const find = record.handle?.find;
            if (!find || this.collected.has(find.id)) continue;
            if (Math.hypot(position.x - find.position.x, position.z - find.position.z) <= radius) {
                this.collected.add(find.id);
                taken.push(find);
            }
        }
        return taken;
    }

    has(id) { return this.collected.has(id); }
    count() { return this.collected.size; }
    snapshot() { return [...this.collected].sort(); }
}
