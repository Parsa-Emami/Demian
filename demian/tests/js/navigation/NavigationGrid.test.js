import test from 'node:test';
import assert from 'node:assert/strict';
import NavigationGrid, { NAVIGATION_CELL_TYPES } from '../../../resources/js/game/shared/navigation/NavigationGrid.js';

test('NavigationGrid finds an A* path around blocked cells', () => {
    const grid = new NavigationGrid({ minX: 0, maxX: 8, minZ: 0, maxZ: 8, cellSize: 1 });
    for (let z = 0; z < 7; z += 1) grid.setCell(3, z, NAVIGATION_CELL_TYPES.BLOCKED);
    const path = grid.findPath({ x: 0.5, z: 0.5 }, { x: 7.5, z: 0.5 }, { smooth: false });
    assert.ok(path.length > 0);
    assert.equal(path.some((point) => grid.worldToCell(point).x === 3 && grid.worldToCell(point).z < 7), false);
});

test('NavigationGrid prevents diagonal corner cutting', () => {
    const grid = new NavigationGrid({ minX: 0, maxX: 3, minZ: 0, maxZ: 3, cellSize: 1 });
    grid.setCell(1, 0, NAVIGATION_CELL_TYPES.BLOCKED);
    grid.setCell(0, 1, NAVIGATION_CELL_TYPES.BLOCKED);
    assert.deepEqual(grid.findPath({ x: 0.5, z: 0.5 }, { x: 1.5, z: 1.5 }), []);
});

test('NavigationGrid weights slow and danger cells instead of always taking shortest geometry', () => {
    const grid = new NavigationGrid({ minX: 0, maxX: 7, minZ: 0, maxZ: 3, cellSize: 1, allowDiagonal: false });
    for (let x = 1; x < 6; x += 1) grid.setCell(x, 1, NAVIGATION_CELL_TYPES.DANGER);
    const path = grid.findPath({ x: 0.5, z: 1.5 }, { x: 6.5, z: 1.5 }, { smooth: false });
    assert.ok(path.some((point) => grid.worldToCell(point).z !== 1));
});

test('NavigationGrid supports dynamic blockers and path smoothing', () => {
    const grid = new NavigationGrid({ minX: 0, maxX: 8, minZ: 0, maxZ: 8, cellSize: 1 });
    grid.setDynamicBlocker('npc', { position: { x: 3.5, z: 3.5 }, radius: 0.4 });
    assert.equal(grid.isWalkable(3, 3), false);
    const raw = grid.findPath({ x: 0.5, z: 0.5 }, { x: 7.5, z: 7.5 }, { smooth: false });
    const smooth = grid.findPath({ x: 0.5, z: 0.5 }, { x: 7.5, z: 7.5 }, { smooth: true });
    assert.ok(smooth.length < raw.length);
    grid.removeDynamicBlocker('npc');
    assert.equal(grid.isWalkable(3, 3), true);
});
