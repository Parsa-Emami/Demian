import test from 'node:test';
import assert from 'node:assert/strict';
import PishiCompanion from '../../resources/js/game/games/open-world/entities/PishiCompanion.js';
import NavigationGrid from '../../resources/js/game/shared/navigation/NavigationGrid.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('Pishi roams and can catch up with Darya around furniture while remaining on walkable floor', () => {
    const grid = new NavigationGrid({ minX: -9, maxX: 9, minZ: -9, maxZ: 9, cellSize: .5 });
    grid.fillAabb({ minX: 3.5, maxX: 4, minZ: -2, maxZ: 2 }, 'blocked', .25);
    const pishi = new PishiCompanion(grid, { x: 0, z: 0 });
    const start = pishi.position;
    const walk = (seconds, target, facing) => {
        for (let i = 0; i < seconds * 60; i++) {
            const previous = pishi.position;
            pishi.step(1 / 60, target, facing);
            assert.ok(grid.lineWalkable(previous, pishi.position));
        }
    };
    walk(3, null);
    assert.ok(distance(start, pishi.position) > .4);
    const darya = { x: 7, z: 0 };
    walk(7, darya, { x: 1, z: 0 });
    assert.ok(distance(darya, pishi.position) < 3.8);
    assert.ok(pishi.position.x > 4.5);
});
