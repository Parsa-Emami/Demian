import test from 'node:test';
import assert from 'node:assert/strict';
import CollisionWorld from '../../../resources/js/game/shared/collision/CollisionWorld.js';
import NavigationGrid from '../../../resources/js/game/shared/navigation/NavigationGrid.js';
import { CAFE_HIDE_MAP } from '../../../resources/js/game/games/hide-and-seek/maps/CafeHideMap.js';

test('Every gameplay spawn can reach at least one hide spot through the shared navigation grid', () => {
    const world = new CollisionWorld({ cellSize: 1 });
    const scope = world.createScope('map');
    CAFE_HIDE_MAP.staticColliders.forEach((definition) => {
        scope.addStaticAabb(definition.id, definition.position, definition.halfExtents);
    });
    const grid = new NavigationGrid({
        minX: CAFE_HIDE_MAP.bounds.minX,
        maxX: CAFE_HIDE_MAP.bounds.maxX,
        minZ: CAFE_HIDE_MAP.bounds.minZ,
        maxZ: CAFE_HIDE_MAP.bounds.maxZ,
        cellSize: 0.8,
        allowDiagonal: true,
    });
    grid.rasterizeColliders(CAFE_HIDE_MAP.staticColliders.map((entry) => scope.get(entry.id)), { padding: 0.66 });
    const spawns = [CAFE_HIDE_MAP.playerSpawn, CAFE_HIDE_MAP.seekerSpawn, ...CAFE_HIDE_MAP.hiderSpawns];
    spawns.forEach((spawn) => {
        const reachable = CAFE_HIDE_MAP.hideSpots.some((spot) => grid.findPath(spawn, spot.position).length > 0);
        assert.equal(reachable, true, `No hide spot reachable from ${spawn.x},${spawn.z}`);
    });
});
