import {
    CAFE_BOUNDS,
    CAFE_FLOOR,
    CAFE_STATIC_COLLIDERS,
    HIDE_SPOTS,
    HIDE_LIGHT_ZONES,
    HIDE_PATROL_POINTS,
} from '../../../shared/cafe/CafeReferenceLayout.js';

const freezePoint = (x, z) => Object.freeze({ x, z });

export const CAFE_HIDE_MAP = Object.freeze({
    id: 'cafe-hide-map-v2-reference-cafe',
    title: 'Reference Café After Hours',
    bounds: CAFE_BOUNDS,
    floor: CAFE_FLOOR,
    playerSpawn: freezePoint(0, 14.2),
    seekerSpawn: freezePoint(17.0, -12.0),
    hiderSpawns: Object.freeze([
        freezePoint(-4.0, 13.0),
        freezePoint(8.0, 14.0),
        freezePoint(-2.0, -12.0),
    ]),
    patrolPoints: HIDE_PATROL_POINTS,
    staticColliders: CAFE_STATIC_COLLIDERS,
    hideSpots: HIDE_SPOTS,
    lightZones: HIDE_LIGHT_ZONES,
});

export function validateCafeHideMap(map = CAFE_HIDE_MAP) {
    const ids = new Set();
    for (const entry of [...map.staticColliders, ...map.hideSpots]) {
        if (!entry.id || ids.has(entry.id)) return false;
        ids.add(entry.id);
    }
    return map.bounds.minX < map.bounds.maxX && map.bounds.minZ < map.bounds.maxZ && map.hideSpots.length >= 4;
}
