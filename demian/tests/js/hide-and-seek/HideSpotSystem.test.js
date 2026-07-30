import test from 'node:test';
import assert from 'node:assert/strict';
import HideSpotSystem from '../../../resources/js/game/games/hide-and-seek/systems/HideSpotSystem.js';

const spots = [
    { id: 'box', position: { x: 1, z: 0 }, exitPosition: { x: 2, z: 0 }, radius: 1, capacity: 1, concealment: 0.9 },
    { id: 'curtain', position: { x: 8, z: 0 }, radius: 1, capacity: 2, concealment: 0.7 },
];

test('HideSpotSystem enforces capacity and tracks actor lifecycle', () => {
    const system = new HideSpotSystem(spots);
    assert.equal(system.enter('a', 'box').spot.id, 'box');
    assert.equal(system.enter('b', 'box'), null);
    assert.equal(system.spotForActor('a').id, 'box');
    assert.equal(system.exit('a').position.x, 2);
    assert.equal(system.available('box'), true);
});

test('HideSpotSystem reveals all occupants and finds nearest available spot', () => {
    const system = new HideSpotSystem(spots);
    system.enter('a', 'curtain');
    system.enter('b', 'curtain');
    assert.equal(system.nearest({ x: 0, z: 0 }, { requireAvailable: true }).spot.id, 'box');
    assert.deepEqual(system.reveal('curtain').sort(), ['a', 'b']);
    assert.equal(system.occupancy('curtain'), 0);
});
