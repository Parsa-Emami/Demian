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
    playerSpawn: freezePoint(-17.2, 13.4),
    seekerSpawn: freezePoint(17.0, -12.0),
    hiderSpawns: Object.freeze([
        freezePoint(-13.0, 10.0),
        freezePoint(13.5, 7.5),
        freezePoint(-11.5, -13.2),
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
