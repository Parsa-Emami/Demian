import CollisionWorld from '../../shared/collision/CollisionWorld.js';
import { COLLISION_LAYERS } from '../../shared/collision/CollisionLayers.js';
import NavigationGrid, { NAVIGATION_CELL_TYPES } from '../../shared/navigation/NavigationGrid.js';
import { CAFE_STATIC_COLLIDERS } from '../../shared/cafe/CafeReferenceLayout.js';
import { cafeFloorAt, freezeCafe } from '../../shared/cafe/CafeWalkthroughScene.js';

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

const STATIC = Object.freeze({ mask: COLLISION_LAYERS.WORLD, types: ['static'] });
const WALLS = { ...STATIC, predicate: (collider) => collider.userData?.kind === 'wall' };

export function circuitAt(point) {
    return CIRCUITS.find((circuit) => point.z >= circuit.minZ)?.id ?? 'storage';
}

export function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

export function createShiftTerrain() {
    const collision = new CollisionWorld();
    const scope = collision.createScope('after-hours');
    for (const solid of CAFE_STATIC_COLLIDERS) {
        scope.addStaticAabb(solid.id, solid.position, solid.halfExtents, { userData: { kind: solid.kind } });
    }
    const grid = new NavigationGrid({ ...SHIFT_BOUNDS, cellSize: 0.6 });
    const hasFloor = (point) => {
        const { x, z } = point;
        return x >= SHIFT_BOUNDS.minX + BODY_RADIUS && x <= SHIFT_BOUNDS.maxX - BODY_RADIUS
            && z >= SHIFT_BOUNDS.minZ + BODY_RADIUS && z <= SHIFT_BOUNDS.maxZ - BODY_RADIUS
            && cafeFloorAt(point);
    };
    const canStand = (point) => hasFloor(point) && !scope.queryCircle(point, BODY_RADIUS + 0.03, STATIC).length;
    for (let z = 0; z < grid.height; z += 1) {
        for (let x = 0; x < grid.width; x += 1) {
            if (!canStand(grid.cellToWorld({ x, z }))) grid.setCell(x, z, NAVIGATION_CELL_TYPES.BLOCKED);
        }
    }
    for (const [id, position] of [['player', SHIFT_START], ['shadow', SHADOW_ROUTE[0]]]) {
        scope.addDynamicCircle(id, position, BODY_RADIUS, { mask: COLLISION_LAYERS.WORLD });
    }
    return {
        grid,
        canStand,
        reset(id, point) { scope.sync(id, point); },
        move(id, point) {
            const { minX, maxX, minZ, maxZ } = SHIFT_BOUNDS;
            const target = {
                x: Math.min(maxX - BODY_RADIUS, Math.max(minX + BODY_RADIUS, point.x)),
                z: Math.min(maxZ - BODY_RADIUS, Math.max(minZ + BODY_RADIUS, point.z)),
            };
            return scope.moveCircle(id, target).position;
        },
        canSee(from, to) { return !scope.raycast(from, to, STATIC); },
        soundClear(from, to) { return !scope.raycast(from, to, WALLS); },
        dispose() { scope.dispose(); collision.dispose(); },
    };
}
