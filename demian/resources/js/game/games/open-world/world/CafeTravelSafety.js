import { cafeRoomAt } from '../../../shared/cafe/CafeWalkthroughScene.js';

export function cafeRestorePlan(state, manifest) {
    const oldVersion = Number(state.worldVersion ?? 1);
    const legacyLayout = oldVersion !== manifest.version;
    // The model replaces the old inferred geometry. Reuse named destinations,
    // not coordinates from an unrelated floorplan. Character/progress IDs survive.
    const requested = legacyLayout ? (manifest.savePoint(state.lastSavePointId)?.position ?? manifest.spawn)
        : state.position ?? manifest.spawn;
    return { legacyLayout, requested };
}

/** Stored positions must be on actual floor AND connected to the entrance. */
export function safeCafeTravelPosition(requested, grid, fallback) {
    const valid = Number.isFinite(requested?.x) && Number.isFinite(requested?.z);
    const point = valid && cafeRoomAt(requested) ? requested : fallback;
    const cell = grid.worldToCell(point);
    if (grid.isWalkable(cell.x,cell.z) && grid.findPath(fallback,point).length) return { x:point.x,z:point.z };
    const resolved = grid.nearestWalkable(cell,12);
    if (resolved) {
        const candidate = grid.cellToWorld(resolved);
        if (cafeRoomAt(candidate) && grid.findPath(fallback,candidate).length) return candidate;
    }
    return { x:fallback.x,z:fallback.z };
}

export function reconcileCafeDiscovery(discovery, manifest, { legacyLayout = false } = {}) {
    const state = discovery.export();
    const saves = state.unlockedSavePoints.filter((id) => manifest.savePoint(id));
    const chunks = legacyLayout ? [] : state.discoveredChunks.filter((id) => manifest.chunk(id));
    discovery.import({ discoveredChunks:chunks,unlockedSavePoints:saves });
    discovery.unlockSavePoint('save-entrance');
    for (const id of [...saves,'save-entrance']) discovery.discoverChunk(manifest.savePoint(id).chunkId);
}
