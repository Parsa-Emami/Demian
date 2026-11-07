import { createCafeGround } from '../../shared/cafe/CafeGround.js';
import { freezeCafe } from '../../shared/cafe/CafeWalkthroughScene.js';

export const SHIFT_BOUNDS = Object.freeze({ minX: -14.7, maxX: 14.7, minZ: -76.1, maxZ: -2.4 });
export const BODY_RADIUS = 0.44;
export const CIRCUITS = freezeCafe([
    { id: 'exit', label: 'خروجی', minZ: -16.5, maxZ: SHIFT_BOUNDS.maxZ },
    { id: 'counter', label: 'پیشخوان', minZ: -55.5, maxZ: -16.5 },
    { id: 'storage', label: 'انبار', minZ: SHIFT_BOUNDS.minZ, maxZ: -55.5 },
]);

export const SHIFT_RULES = freezeCafe({
    standard: {
        label: 'استاندارد', level: 6, duration: 300, grace: 7,
        patrolSpeed: 3.7, searchSpeed: 5.7, chaseSpeed: 8.2,
        reaction: 0.58, memory: 2.6, hearing: 1, darkSight: 13, litSight: 6,
    },
    hard: {
        label: 'سخت', level: 8, duration: 240, grace: 5,
        patrolSpeed: 4.6, searchSpeed: 7.1, chaseSpeed: 9.7,
        reaction: 0.3, memory: 3.6, hearing: 1.28, darkSight: 16, litSight: 7.5,
    },
});

export const SHIFT_START = Object.freeze({ x: -1.2, z: -6.5 });
export const SHIFT_EXIT = freezeCafe({ id: 'exit', kind: 'exit', label: 'درِ خروج', x: 0.4, z: -3.9 });
export const SHIFT_LOCKER = freezeCafe({ id: 'locker', kind: 'locker', label: 'محفظهٔ فلزی', x: -11.6, z: -74.95 });
export const SHIFT_PANELS = freezeCafe([
    { id: 'panel-front', kind: 'panel', label: 'تابلو برق ورودی', x: 2.9, z: -9.0 },
    { id: 'panel-back', kind: 'panel', label: 'تابلو برق راهرو', x: -1.8, z: -52.1 },
]);

export const SHIFT_LAYOUTS = freezeCafe([
    [{ x: 1.1, z: -24.8 }, { x: 3.7, z: -68.5 }],
    [{ x: -10.9, z: -34.6 }, { x: -11.8, z: -65.5 }],
    [{ x: 7.0, z: -48.8 }, { x: -6.4, z: -72.7 }],
]);

export const SHADOW_ROUTE = freezeCafe([
    { x: 4.5, z: -70.1 }, { x: -4.2, z: -73.4 }, { x: -5.1, z: -55.0 },
    { x: -11.1, z: -38.0 }, { x: 1.0, z: -22.5 }, { x: 3.1, z: -47.5 },
    { x: 7.0, z: -54.4 },
]);

export function circuitAt(point) {
    return CIRCUITS.find((circuit) => point.z >= circuit.minZ)?.id ?? 'storage';
}

export function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createShiftTerrain() {
    return createCafeGround({
        bounds: SHIFT_BOUNDS,
        radius: BODY_RADIUS,
        actors: { player: SHIFT_START, shadow: SHADOW_ROUTE[0] },
        owner: 'after-hours',
    });
}
