import test from 'node:test';
import assert from 'node:assert/strict';
import RoleAssigner from '../../../resources/js/game/games/hide-and-seek/match/RoleAssigner.js';

test('RoleAssigner is deterministic for a seed and honors requested player role', () => {
    const ids = ['player', 'a', 'b', 'c'];
    const first = new RoleAssigner('seed-42').assign(ids, { playerId: 'player' });
    const second = new RoleAssigner('seed-42').assign(ids, { playerId: 'player' });
    assert.equal(first.seekerId, second.seekerId);
    assert.equal([...first.roles.values()].filter((role) => role === 'seeker').length, 1);
    assert.equal(new RoleAssigner('x').assign(ids, { playerId: 'player', requestedPlayerRole: 'seeker' }).seekerId, 'player');
    assert.notEqual(new RoleAssigner('x').assign(ids, { playerId: 'player', requestedPlayerRole: 'hider' }).seekerId, 'player');
});
