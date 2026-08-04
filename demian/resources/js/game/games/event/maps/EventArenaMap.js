import { CAFE_BOUNDS, CAFE_FLOOR, CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';

const point = (x, z) => Object.freeze({ x, z });

export const EVENT_ARENA_MAP = Object.freeze({
    id: 'demian-event-arena-reference-cafe',
    bounds: CAFE_BOUNDS,
    floor: CAFE_FLOOR,
    spawn: point(-17.2, 13.0),
    staticColliders: CAFE_STATIC_COLLIDERS,
});
