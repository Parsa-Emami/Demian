import test from 'node:test';
import assert from 'node:assert/strict';
import HiderBrain, { HIDER_STATES } from '../../../resources/js/game/games/hide-and-seek/ai/HiderBrain.js';

test('HiderBrain selects an available preferred spot and requests entry near it', () => {
    const brain = new HiderBrain({ preferredSpotIds: ['preferred'] });
    const self = { position: { x: 0, z: 0 }, hidden: false, eliminated: false };
    const spots = [
        { id: 'other', position: { x: 1, z: 0 }, available: true },
        { id: 'preferred', position: { x: 1.7, z: 0 }, radius: 1, available: true },
    ];
    const intent = brain.update(0.1, { self, spots, hidingPhase: true });
    assert.equal(intent.state, HIDER_STATES.MOVE_TO_SPOT);
    assert.equal(intent.spotId, 'preferred');
    assert.equal(intent.action, 'enter-hide-spot');
});

test('HiderBrain remains hidden and becomes eliminated deterministically', () => {
    const brain = new HiderBrain();
    assert.equal(brain.update(0.1, { self: { position: { x: 0, z: 0 }, hidden: true, spotId: 'x', eliminated: false } }).state, HIDER_STATES.HIDDEN);
    assert.equal(brain.update(0.1, { self: { position: { x: 0, z: 0 }, hidden: false, eliminated: true } }).state, HIDER_STATES.ELIMINATED);
});
