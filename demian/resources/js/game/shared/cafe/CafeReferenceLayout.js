import {
    CAFE_BOUNDS, CAFE_FLOOR, CAFE_WALLS, CAFE_FIXTURES, freezeCafe, cafePoint,
} from './CafeWalkthroughScene.js';
export { CAFE_BOUNDS, CAFE_FLOOR } from './CafeWalkthroughScene.js';

const point = cafePoint;

// Geometry is authored once. Painting and collision consume the same objects;
// rugs, mirrors mounted on a wall, lamps and table-top props add no phantom walls.
export const CAFE_STATIC_COLLIDERS = freezeCafe([...CAFE_WALLS, ...CAFE_FIXTURES].map((entry) => ({
    id: entry.id, kind: entry.kind, position: entry.position, halfExtents: entry.halfExtents,
    height: entry.height ?? 1, material: entry.material, style: entry.style,
})));

export const ROLE_PLAY_NPCS = freezeCafe([
    { id: 'setayesh', name: 'ستایش', dialogueId: 'setayesh-intro', position: point(0, 7.5), color: 0x22d3ee },
    { id: 'uzudi', name: 'اوزودی', dialogueId: 'uzudi-shift', position: point(8.1, 5), color: 0xf472b6 },
    { id: 'amirreza', name: 'امیررضا', dialogueId: 'amirreza-arcade', position: point(.8, -27), color: 0xfbbf24 },
]);
export const ROLE_PLAY_PICKUPS = freezeCafe([
    { id: 'coffee-1', itemId: 'coffee-cup', position: point(4.15, 6), color: 0xf59e0b },
    { id: 'coffee-2', itemId: 'coffee-cup', position: point(4.15, 7.6), color: 0xf59e0b },
    { id: 'coffee-3', itemId: 'coffee-cup', position: point(4.15, 9.2), color: 0xf59e0b },
    { id: 'repair-kit', itemId: 'repair-kit', position: point(8.1, 8.9), color: 0x38bdf8 },
]);
export const ROLE_PLAY_INTERACTABLES = freezeCafe([
    { id: 'table-04', kind: 'delivery', label: 'تحویل سفارش به میز جمعی', position: point(-3.0, 9.7), radius: 2.3 },
    { id: 'counter-pickup', kind: 'repair', label: 'بررسی دستگاه اسپرسو', position: point(8.1, .3), radius: 2.25 },
    { id: 'save-point', kind: 'save', label: 'ذخیرهٔ پیشرفت', position: point(.8, -39.5), radius: 2 },
]);
export const ROLE_PLAY_ZONES = freezeCafe([
    { id: 'cafe-entrance', position: point(0, 14.2), radius: 2.8 },
    { id: 'counter-zone', position: point(8.1, 3.5), radius: 3.2 },
    { id: 'lounge-zone', position: point(.8, -29), radius: 3.6 },
    { id: 'washroom-zone', position: point(3.3, -53), radius: 2.1 },
]);
export const HIDE_SPOTS = freezeCafe([
    { id: 'behind-counter', label: 'پشت پیشخوان', position: point(8.1, -1.3), exitPosition: point(8.1, .2), radius: 1.1, capacity: 1, concealment: .95, color: 0xf472b6 },
    { id: 'merch-shelf-shadow', label: 'کنار استند محصولات', position: point(8.7, 14.5), exitPosition: point(5.4, 14.5), radius: 1, capacity: 1, concealment: .9, color: 0x22d3ee },
    { id: 'hide-communal-table', label: 'کنار میز جمعی', position: point(-2.2, 9.7), exitPosition: point(0, 9.7), radius: 1, capacity: 1, concealment: .82, color: 0xfb7185 },
    { id: 'mirror-corner', label: 'کنار آینه', position: point(-9, 2.8), exitPosition: point(-6.5, 3), radius: 1, capacity: 1, concealment: .84, color: 0x67e8f9 },
    { id: 'sofa-shadow', label: 'پشت مبل', position: point(6.7, -24), exitPosition: point(2, -24), radius: 1, capacity: 1, concealment: .88, color: 0xc084fc },
    { id: 'hide-round-table-left', label: 'کنار میز سالن پشتی', position: point(-1.8, -15), exitPosition: point(.8, -15), radius: 1, capacity: 1, concealment: .8, color: 0xfbbf24 },
    { id: 'entrance-planters', label: 'میان گلدان‌های ورودی', position: point(5.2, 16), exitPosition: point(2.2, 14.2), radius: 1, capacity: 1, concealment: .79, color: 0x34d399 },
    { id: 'lounge-corner', label: 'گوشهٔ لانژ', position: point(3, -39), exitPosition: point(.8, -39), radius: 1, capacity: 1, concealment: .9, color: 0xa78bfa },
]);
export const HIDE_LIGHT_ZONES = freezeCafe([
    { id: 'bright-entrance', position: point(0, 14.6), radius: 8, lightLevel: 1 },
    { id: 'counter-light', position: point(8.1, 3.5), radius: 6.2, lightLevel: .72 },
    { id: 'lounge-dim', position: point(.8, -29), radius: 12, lightLevel: .34 },
]);
export const HIDE_PATROL_POINTS = freezeCafe([
    point(0, 14), point(0, 5), point(1.6, -10), point(.8, -19),
    point(.8, -29), point(2, -40), point(3.3, -48), point(3.3, -61),
]);
