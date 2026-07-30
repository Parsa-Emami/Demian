import test from 'node:test';
import assert from 'node:assert/strict';
import MatchDirector from '../../../resources/js/game/games/hide-and-seek/match/MatchDirector.js';
import { MATCH_STATES, MATCH_WINNERS } from '../../../resources/js/game/games/hide-and-seek/match/MatchState.js';

const config = {
    phases: { roleRevealSeconds: 1, hidingSeconds: 2, seekingSeconds: 3, roundEndSeconds: 1 },
};

test('MatchDirector follows the complete phase lifecycle', () => {
    const events = [];
    const director = new MatchDirector({ config, onEvent: (event) => events.push(event.type) });
    director.start({ participantIds: ['player', 'a', 'b'], playerId: 'player', requestedPlayerRole: 'hider', seed: 'test' });
    assert.equal(director.state, MATCH_STATES.ROLE_REVEAL);
    director.update(1);
    assert.equal(director.state, MATCH_STATES.HIDING_COUNTDOWN);
    assert.equal(director.isMovementAllowed('player'), true);
    assert.equal(director.isMovementAllowed(director.seekerId), false);
    director.update(2);
    assert.equal(director.state, MATCH_STATES.SEEKING);
    director.update(3);
    assert.equal(director.state, MATCH_STATES.ROUND_END);
    assert.equal(director.winner, MATCH_WINNERS.HIDERS);
    director.update(1);
    assert.equal(director.state, MATCH_STATES.RESULTS);
    assert.ok(events.includes('results-ready'));
});

test('MatchDirector ends early when every hider is eliminated', () => {
    const director = new MatchDirector({ config });
    director.start({ participantIds: ['player', 'a', 'b'], playerId: 'player', requestedPlayerRole: 'seeker', seed: 'test' });
    director.update(1);
    director.update(2);
    const hiders = [...director.participants.values()].filter((entry) => entry.role === 'hider');
    hiders.forEach((entry) => director.eliminateHider(entry.id));
    assert.equal(director.state, MATCH_STATES.ROUND_END);
    assert.equal(director.winner, MATCH_WINNERS.SEEKER);
    assert.equal(director.remainingHiders, 0);
});
