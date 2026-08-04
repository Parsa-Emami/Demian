import {
    CAFE_BOUNDS,
    CAFE_FLOOR,
    CAFE_STATIC_COLLIDERS,
    ROLE_PLAY_NPCS,
    ROLE_PLAY_PICKUPS,
    ROLE_PLAY_INTERACTABLES,
    ROLE_PLAY_ZONES,
} from '../../../shared/cafe/CafeReferenceLayout.js';

export const ROLE_PLAY_CAFE_MAP = Object.freeze({
    id: 'demian-cafe-role-play',
    bounds: CAFE_BOUNDS,
    floor: CAFE_FLOOR,
    spawn: Object.freeze({ x: 0, z: 12.8 }),
    staticColliders: CAFE_STATIC_COLLIDERS,
    npcs: ROLE_PLAY_NPCS,
    pickups: ROLE_PLAY_PICKUPS,
    interactables: ROLE_PLAY_INTERACTABLES,
    zones: ROLE_PLAY_ZONES,
});
