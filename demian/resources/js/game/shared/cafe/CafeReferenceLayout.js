import { CAFE_BOUNDS, CAFE_FLOOR, CAFE_FBX, freezeCafe } from './CafeWalkthroughScene.js';
export { CAFE_BOUNDS, CAFE_FLOOR };
// Generated occupied cells include exact source furniture, walls and non-floor voids.
export const CAFE_STATIC_COLLIDERS = CAFE_FBX.colliders;
export const ROLE_PLAY_NPCS = freezeCafe([
    { id: 'setayesh', name: 'ستایش', dialogueId: 'setayesh-intro', position: { x: .36, z: -24.84 }, color: 0x22d3ee },
    { id: 'uzudi', name: 'اوزودی', dialogueId: 'uzudi-shift', position: { x: 3.24, z: -30.6 }, color: 0xf472b6 },
    { id: 'amirreza', name: 'امیررضا', dialogueId: 'amirreza-arcade', position: { x: .36, z: -68.76 }, color: 0xfbbf24 },
]);
export const ROLE_PLAY_PICKUPS = freezeCafe([
    { id: 'coffee-1', itemId: 'coffee-cup', position: { x: 3.96, z: -9.72 }, color: 0xf59e0b },
    { id: 'coffee-2', itemId: 'coffee-cup', position: { x: .36, z: -24.84 }, color: 0xf59e0b },
    { id: 'coffee-3', itemId: 'coffee-cup', position: { x: 3.24, z: -30.6 }, color: 0xf59e0b },
    { id: 'repair-kit', itemId: 'repair-kit', position: { x: 9, z: -15.48 }, color: 0x38bdf8 },
]);
export const ROLE_PLAY_INTERACTABLES = freezeCafe([
    { id: 'table-04', kind: 'delivery', label: 'تحویل سفارش', position: { x: -1.8, z: -11.16 }, radius: 2.3 },
    { id: 'counter-pickup', kind: 'repair', label: 'بررسی دستگاه اسپرسو', position: { x: 3.24, z: -30.6 }, radius: 2.25 },
    { id: 'save-point', kind: 'save', label: 'ذخیرهٔ پیشرفت', position: { x: 6.84, z: -104.04 }, radius: 2 },
]);
export const ROLE_PLAY_ZONES = freezeCafe([
    { id: 'cafe-entrance', position: { x: .36, z: -4.68 }, radius: 3 },
    { id: 'counter-zone', position: { x: 3.24, z: -30.6 }, radius: 3 },
    { id: 'lounge-zone', position: { x: .36, z: -68.76 }, radius: 4 },
    { id: 'washroom-zone', position: { x: 3.96, z: -130.68 }, radius: 2 },
]);
const hidingPoints = [[-1.8,-11.16],[3.96,-9.72],[9,-15.48],[3.24,-30.6],[-6.12,-73.08],[9.72,-62.28],[1.08,-79.56],[6.84,-104.04]];
export const HIDE_SPOTS = freezeCafe(hidingPoints.map(([x,z],i) => ({ id: `fbx-hide-${i+1}`,
    label: 'کنار مبلمان', position: { x,z }, exitPosition: { x,z }, radius: 1, capacity: 1, concealment: .8, color: 0x34d399 })));
export const HIDE_LIGHT_ZONES = freezeCafe([
    { id: 'bright-entrance', position: { x: .36,z: -4.68 }, radius: 12,lightLevel: 1 },
    { id: 'counter-light', position: { x: 3.24,z: -30.6 }, radius: 10,lightLevel: .72 },
    { id: 'lounge-dim', position: { x: .36,z: -68.76 }, radius: 16,lightLevel: .34 },
]);
export const HIDE_PATROL_POINTS = freezeCafe([
    { x: .36,z: -4.68 },{ x: .36,z: -24.84 },{ x: .36,z: -44.28 },
    { x: .36,z: -68.76 },{ x: 3.96,z: -88.92 },{ x: 6.84,z: -104.04 },
]);
