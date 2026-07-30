import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventSnapshot, validateEventCommand } from '../../../resources/js/game/games/event/protocol/EventProtocol.js';

 test('Event protocol creates immutable authoritative snapshots', () => {
    const director = { snapshot: () => ({ eventId: 'cafe-rush', sessionId: 's1', state: 'active', objectives: [], remaining: 20 }) };
    const snapshot = createEventSnapshot({
        director,
        player: { tick: 12, position: { x: 1, z: 2 }, health: 80 },
        score: { score: 900 },
        enemies: [{ defeated: false }],
        collectibles: [{ collected: true }, { collected: false }],
    });
    assert.equal(snapshot.protocolVersion, 1);
    assert.equal(snapshot.collectiblesRemaining, 1);
    assert.equal(Object.isFrozen(snapshot), true);
});

test('Event protocol validates semantic client commands', () => {
    assert.equal(validateEventCommand({ protocolVersion: 1, type: 'action', tick: 4 }), true);
    assert.equal(validateEventCommand({ protocolVersion: 1, type: 'cheat', tick: 4 }), false);
});
