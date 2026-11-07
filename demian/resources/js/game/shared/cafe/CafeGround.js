import CollisionWorld from '../collision/CollisionWorld.js';
import { COLLISION_LAYERS } from '../collision/CollisionLayers.js';
import NavigationGrid, { NAVIGATION_CELL_TYPES } from '../navigation/NavigationGrid.js';
import { CAFE_STATIC_COLLIDERS } from './CafeReferenceLayout.js';
import { cafeFloorAt } from './CafeWalkthroughScene.js';

const STATIC = Object.freeze({ mask: COLLISION_LAYERS.WORLD, types: ['static'] });
const WALLS = { ...STATIC, predicate: (collider) => collider.userData?.kind === 'wall' };

export function createCafeGround({ bounds, radius, actors, owner }) {
    const collision = new CollisionWorld();
    const scope = collision.createScope(owner);
    for (const solid of CAFE_STATIC_COLLIDERS) {
        scope.addStaticAabb(solid.id, solid.position, solid.halfExtents, { userData: { kind: solid.kind } });
    }
    const grid = new NavigationGrid({ ...bounds, cellSize: 0.6 });
    const hasFloor = (point) => {
        const { x, z } = point;
        return x >= bounds.minX + radius && x <= bounds.maxX - radius
            && z >= bounds.minZ + radius && z <= bounds.maxZ - radius
            && cafeFloorAt(point);
    };
    const canStand = (point) => hasFloor(point) && !scope.queryCircle(point, radius + 0.03, STATIC).length;
    for (let z = 0; z < grid.height; z += 1) {
        for (let x = 0; x < grid.width; x += 1) {
            if (!canStand(grid.cellToWorld({ x, z }))) grid.setCell(x, z, NAVIGATION_CELL_TYPES.BLOCKED);
        }
    }
    for (const [id, position] of Object.entries(actors)) {
        scope.addDynamicCircle(id, position, radius, { mask: COLLISION_LAYERS.WORLD });
    }
    return {
        grid,
        canStand,
        reset(id, point) { scope.sync(id, point); },
        move(id, point) {
            const { minX, maxX, minZ, maxZ } = bounds;
            const target = {
                x: Math.min(maxX - radius, Math.max(minX + radius, point.x)),
                z: Math.min(maxZ - radius, Math.max(minZ + radius, point.z)),
            };
            return scope.moveCircle(id, target).position;
        },
        canSee(from, to) { return !scope.raycast(from, to, STATIC); },
        soundClear(from, to) { return !scope.raycast(from, to, WALLS); },
        dispose() { scope.dispose(); collision.dispose(); },
    };
}
