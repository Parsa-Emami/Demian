import { CAFE_BOUNDS, CAFE_FLOOR, CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';

const point = (x, z) => Object.freeze({ x, z });

export const EVENT_ARENA_MAP = Object.freeze({
    id: 'demian-event-arena-reference-cafe',
    bounds: CAFE_BOUNDS,
    floor: CAFE_FLOOR,
    spawn: point(0, 14.2),
    staticColliders: CAFE_STATIC_COLLIDERS,
});
