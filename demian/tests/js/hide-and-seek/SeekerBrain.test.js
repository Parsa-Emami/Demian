import test from 'node:test';
import assert from 'node:assert/strict';
import SeekerBrain, { SEEKER_STATES } from '../../../resources/js/game/games/hide-and-seek/ai/SeekerBrain.js';

test('SeekerBrain chases visible hiders and searches the last seen position', () => {
    const brain = new SeekerBrain({ patrolPoints: [{ x: 5, z: 0 }], memorySeconds: 5 });
    const self = { position: { x: 0, z: 0 } };
    const chase = brain.update(0.1, { self, seeking: true, visibleHiders: [{ id: 'h', position: { x: 2, z: 1 }, eliminated: false }] });
    assert.equal(chase.state, SEEKER_STATES.CHASE);
    const search = brain.update(0.1, { self, seeking: true, visibleHiders: [], hideSpots: [] });
    assert.equal(search.state, SEEKER_STATES.SEARCH);
    assert.equal(search.targetId, 'h');
});

test('SeekerBrain checks nearby unvisited hide spots before patrol', () => {
    const brain = new SeekerBrain({ patrolPoints: [{ x: 10, z: 0 }] });
    const intent = brain.update(0.1, {
        self: { position: { x: 0, z: 0 } },
        seeking: true,
        visibleHiders: [],
        hideSpots: [{ id: 'spot', position: { x: 2, z: 0 }, radius: 1 }],
    });
    assert.equal(intent.state, SEEKER_STATES.CHECK_HIDE_SPOT);
    assert.equal(intent.action, 'check-hide-spot');
});
