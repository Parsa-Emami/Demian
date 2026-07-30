function point2(value = {}) {
    return { x: Number(value.x) || 0, z: Number(value.z) || 0 };
}

export default class WorldPartition {
    constructor(manifest) {
        if (!manifest?.chunkSize || !manifest?.chunks) throw new TypeError('WorldPartition requires a WorldManifest.');
        this.manifest = manifest;
        this.chunkSize = manifest.chunkSize;
    }

    worldToGrid(position) {
        const point = point2(position);
        return {
            x: Math.floor((point.x - this.manifest.origin.x) / this.chunkSize),
            z: Math.floor((point.z - this.manifest.origin.z) / this.chunkSize),
        };
    }

    gridToWorld(grid) {
        return {
            x: this.manifest.origin.x + (Number(grid.x) + 0.5) * this.chunkSize,
            z: this.manifest.origin.z + (Number(grid.z) + 0.5) * this.chunkSize,
        };
    }

    chunkAt(position) {
        const grid = this.worldToGrid(position);
        return this.manifest.at(grid.x, grid.z);
    }

    chebyshevDistance(left, right) {
        const a = left.grid ?? left;
        const b = right.grid ?? right;
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
    }

    chunksWithin(position, radius = 1) {
        const center = this.worldToGrid(position);
        return this.manifest.chunks
            .map((chunk) => ({ chunk, distance: this.chebyshevDistance(chunk.grid, center) }))
            .filter(({ distance }) => distance <= radius)
            .sort((a, b) => a.distance - b.distance || a.chunk.id.localeCompare(b.chunk.id));
    }

    clampPosition(position, margin = 0.75) {
        const point = point2(position);
        const bounds = this.manifest.bounds;
        return {
            x: Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, point.x)),
            z: Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, point.z)),
        };
    }
}
