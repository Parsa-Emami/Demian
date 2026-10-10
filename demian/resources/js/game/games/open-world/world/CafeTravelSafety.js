import { cafeRoomAt, cafePoint } from '../../../shared/cafe/CafeWalkthroughScene.js';

export function cafeRestorePlan(state, manifest) {
    const oldVersion = Number(state.worldVersion ?? 1);
    const expanded = oldVersion === 3 && manifest.version === 4;
    const legacyLayout = oldVersion < manifest.version && !expanded;
    const requested = expanded
        ? cafePoint(state.position?.x, state.position?.z)
        : legacyLayout ? (manifest.savePoint(state.lastSavePointId)?.position ?? manifest.spawn)
            : state.position ?? manifest.spawn;
    return { legacyLayout, requested };
}

/** Resolve a stored/fast-travel position to the current, actually walkable floor. */
export function safeCafeTravelPosition(requested, grid, fallback) {
    const valid = Number.isFinite(requested?.x) && Number.isFinite(requested?.z);
    const point = valid && cafeRoomAt(requested) ? requested : fallback;
    const cell = grid.worldToCell(point);
    if (grid.isWalkable(cell.x, cell.z)) return { x: point.x, z: point.z };
    const resolved = grid.nearestWalkable(cell, 12);
    if (resolved) {
        const candidate = grid.cellToWorld(resolved);
        if (cafeRoomAt(candidate)) return candidate;
    }
    return { x: fallback.x, z: fallback.z };
}

export function reconcileCafeDiscovery(discovery, manifest, { legacyLayout = false } = {}) {
    const state = discovery.export();
    // V2 chunk IDs were reused for a different floorplan; stale discoveries
    // must not mark an unrelated room as visited. Save-point IDs stay stable.
    const saves = state.unlockedSavePoints.filter((id) => manifest.savePoint(id));
    const chunks = legacyLayout ? [] : state.discoveredChunks.filter((id) => manifest.chunk(id));
    discovery.import({ discoveredChunks: chunks, unlockedSavePoints: saves });
    discovery.unlockSavePoint('save-entrance');
    for (const id of [...saves, 'save-entrance']) discovery.discoverChunk(manifest.savePoint(id).chunkId);
}
