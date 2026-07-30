import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchSnapshot, validateMatchCommand } from '../../../resources/js/game/games/hide-and-seek/match/MatchProtocol.js';

test('MatchProtocol validates authoritative tick commands', () => {
    assert.equal(validateMatchCommand({ type: 'move', tick: 4, actorId: 'player' }), true);
    assert.equal(validateMatchCommand({ type: 'hack', tick: 4, actorId: 'player' }), false);
    assert.equal(validateMatchCommand({ type: 'move', tick: -1, actorId: 'player' }), false);
});

test('MatchProtocol produces immutable transport snapshots', () => {
    const snapshot = createMatchSnapshot({
        tick: 10,
        state: 'seeking',
        timer: { remaining: 20 },
        participants: [{ id: 'p', role: 'hider', eliminated: false, hidden: true, position: { x: 1, z: 2 } }],
    });
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.participants[0].hidden, true);
    assert.equal(Object.isFrozen(snapshot), true);
});
