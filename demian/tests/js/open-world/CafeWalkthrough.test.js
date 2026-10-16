import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';
import { CAFE_STATIC_COLLIDERS, ROLE_PLAY_NPCS } from '../../../resources/js/game/shared/cafe/CafeReferenceLayout.js';
import {
    CAFE_BOUNDS, CAFE_ROOMS, CAFE_WALKTHROUGH_ROUTE, CAFE_CHARACTER_SPAWNS, cafeRoomAt, cafePoint,
} from '../../../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import Collider from '../../../resources/js/game/shared/collision/Collider.js';
import { circleIntersectsAabb } from '../../../resources/js/game/shared/collision/CollisionMath.js';
import NavigationGrid from '../../../resources/js/game/shared/navigation/NavigationGrid.js';
import PixelCamera2D from '../../../resources/js/game/rendering2d/PixelCamera2D.js';
import WorldDiscovery from '../../../resources/js/game/games/open-world/world/WorldDiscovery.js';
import { safeCafeTravelPosition, reconcileCafeDiscovery, cafeRestorePlan } from '../../../resources/js/game/games/open-world/world/CafeTravelSafety.js';
import { cafeMapCamera } from '../../../resources/js/game/games/open-world/ui/CafeMapProjection.js';

const obstacles = CAFE_STATIC_COLLIDERS.map((d) => new Collider({ ...d, type: 'static', shape: 'aabb' }));

function navigation() {
    return new NavigationGrid({ ...manifest.bounds, cellSize: .72, allowDiagonal: true })
        .rasterizeColliders(obstacles, { padding: .68 });
}

test('a character can walk every leg of the actual entrance-to-WC route without crossing furniture or walls', () => {
    const grid = navigation();
    for (let i = 0; i < CAFE_WALKTHROUGH_ROUTE.length; i += 1) {
        const goal = CAFE_WALKTHROUGH_ROUTE[i];
        const cell = grid.worldToCell(goal);
        assert.ok(grid.isWalkable(cell.x, cell.z), `Blocked waypoint: ${goal.id}`);
        assert.ok(cafeRoomAt(goal), `Waypoint outside observed footprint: ${goal.id}`);
        if (!i) continue;
        const path = grid.findPath(CAFE_WALKTHROUGH_ROUTE[i - 1], goal);
        assert.ok(path.length > 0, `No route to ${goal.id}`);
        for (let n = 1; n < path.length; n += 1) {
            const a = path[n - 1], b = path[n], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .15);
            for (let step = 0; step <= steps; step += 1) {
                const t = step / Math.max(1, steps), p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
                assert.ok(cafeRoomAt(p), `Route left the surveyed floor before ${goal.id}`);
                const hit = obstacles.find((d) => circleIntersectsAabb(p, .72, d.aabb));
                assert.equal(hit?.id, undefined, `Route to ${goal.id} clips ${hit?.id}`);
            }
        }
    }
});

test('all spawn, save and staff positions are reachable and not silently snapped out of obstacles', () => {
    const grid = navigation();
    for (const p of [...CAFE_CHARACTER_SPAWNS, ...manifest.savePoints.map((p) => p.position), ...ROLE_PLAY_NPCS.map((p) => p.position)]) {
        const cell = grid.worldToCell(p);
        assert.ok(grid.isWalkable(cell.x, cell.z), JSON.stringify(p));
        assert.ok(grid.findPath(manifest.spawn, p).length, `Unreachable ${JSON.stringify(p)}`);
    }
});

test('space outside the imported floor is blocked while modeled rear rooms are preserved', () => {
    const grid = navigation();
    for (const p of [{ x: -19,z: -30 },{ x: 18,z: -150 }]) {
        assert.equal(cafeRoomAt(p), null);
        const cell = grid.worldToCell(p);
        assert.equal(grid.isWalkable(cell.x,cell.z), false);
    }
    assert.ok(cafeRoomAt({ x: 0,z: -165 }), 'The supplied model includes the closed rear room.');
    assert.ok(Object.isFrozen(CAFE_ROOMS[0].bounds));
});

test('legacy saves retain unlocked destinations while reused chunk IDs are reconciled to the new layout', () => {
    const discovery = new WorldDiscovery({ discoveredChunks: ['cafe-3-2', 'cafe-0-0'], unlockedSavePoints: ['save-lounge', 'save-arcade', 'removed'] });
    reconcileCafeDiscovery(discovery, manifest, { legacyLayout: true });
    assert.deepEqual([...discovery.export().unlockedSavePoints], ['save-arcade', 'save-entrance', 'save-lounge']);
    assert.equal(discovery.isChunkDiscovered('cafe-3-2'), false);
    assert.equal(discovery.isChunkDiscovered('cafe-0-0'), false);
    for (const id of discovery.export().unlockedSavePoints) assert.ok(discovery.isChunkDiscovered(manifest.savePoint(id).chunkId));
});

test('travel repairs stored positions inside a table, outside the footprint, or with corrupt coordinates', () => {
    const grid = navigation();
    for (const requested of [{ x: -7, z: 9.7 }, { x: -8, z: -58 }, { x: NaN, z: Infinity }]) {
        const resolved = safeCafeTravelPosition(requested, grid, manifest.spawn);
        const cell = grid.worldToCell(resolved);
        assert.ok(cafeRoomAt(resolved));
        assert.ok(grid.isWalkable(cell.x, cell.z));
    }
});

test('V3 and V4 saves retain destinations while positions reset to safe FBX destinations', () => {
    for (const worldVersion of [3,4]) {
        const state = { worldVersion,position:{ x:3.3,z:-53 },lastSavePointId:'save-lounge',
            discoveredChunks:['cafe-0-0','cafe-1-6'],unlockedSavePoints:['save-lounge'] };
        const plan = cafeRestorePlan(state,manifest);
        assert.equal(plan.legacyLayout,true);
        assert.deepEqual(plan.requested,manifest.savePoint('save-lounge').position);
        const discovery = new WorldDiscovery(state);
        reconcileCafeDiscovery(discovery,manifest,plan);
        assert.ok(discovery.isSavePointUnlocked('save-lounge'));
        assert.ok(discovery.isSavePointUnlocked('save-entrance'));
        assert.equal(discovery.isChunkDiscovered('cafe-0-0'),false);
        assert.deepEqual(safeCafeTravelPosition(plan.requested,navigation(),manifest.spawn),plan.requested);
    }
});

test('same-version saves inside source-model sealed rooms return to the accessible entrance', () => {
    assert.deepEqual(safeCafeTravelPosition({ x:0,z:-165 },navigation(),manifest.spawn),manifest.spawn);
});

test('floorplan projections keep the WC above the entrance and preserve distances in both axes', () => {
    const camera = cafeMapCamera(manifest.bounds, 800, 500, 24);
    const origin = camera.worldToScreen({ x: 0, z: 0 });
    assert.ok(camera.worldToScreen({ x: 3.96,z:-130.68 }).y < camera.worldToScreen(manifest.spawn).y);
    assert.ok(Math.abs((camera.worldToScreen({ x: 1, z: 0 }).x - origin.x)
        - (camera.worldToScreen({ x: 0, z: 1 }).y - origin.y)) < 1e-9);
    const p = { x: 3.3, z: -53 }, restored = camera.screenToWorld(camera.worldToScreen(p));
    assert.ok(Math.abs(restored.x - p.x) < 1e-9 && Math.abs(restored.z - p.z) < 1e-9);
});

test('overview framing can fit the long café on a landscape phone instead of cropping it at the old minimum zoom', () => {
    const bounds = { minX: -13, maxX: 13, minZ: -71, maxZ: 24 };
    const camera = new PixelCamera2D({ bounds, viewportWidth: 844, viewportHeight: 390 });
    camera.fitBounds(bounds, 10);
    const a = camera.worldToScreen({ x: bounds.minX, z: bounds.minZ });
    const b = camera.worldToScreen({ x: bounds.maxX, z: bounds.maxZ });
    assert.ok(a.y >= 9 && b.y <= 381);
    assert.ok(a.x >= 9 && b.x <= 835);
});

test('zoomed and panned map projections keep geometry and pointer targets aligned', () => {
    const center={x:5,z:-100},camera=cafeMapCamera(CAFE_BOUNDS,800,500,20,{zoom:6,center});
    assert.deepEqual(camera.worldToScreen(center),{x:400,y:250});
    for(const p of CAFE_WALKTHROUGH_ROUTE) {
        const restored=camera.screenToWorld(camera.worldToScreen(p));
        assert.ok(Math.abs(restored.x-p.x)<1e-9 && Math.abs(restored.z-p.z)<1e-9);
    }
});
