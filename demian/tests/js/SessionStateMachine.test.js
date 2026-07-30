import test from 'node:test';
import assert from 'node:assert/strict';
import SessionStateMachine, { SESSION_STATES } from '../../resources/js/game/application/SessionStateMachine.js';

test('SessionStateMachine supports the phase-two menu and gameplay lifecycle', () => {
    const machine = new SessionStateMachine();

    machine.transition(SESSION_STATES.MENU);
    machine.transition(SESSION_STATES.LOADING, { gameId: 'open-world' });
    machine.transition(SESSION_STATES.PLAYING);
    machine.transition(SESSION_STATES.PAUSED);
    machine.transition(SESSION_STATES.PLAYING);
    machine.transition(SESSION_STATES.RESULTS);
    machine.transition(SESSION_STATES.MENU);

    assert.equal(machine.state, SESSION_STATES.MENU);
    assert.equal(machine.history.length, 8);
    assert.equal(machine.history[2].metadata.gameId, 'open-world');
});

test('SessionStateMachine rejects invalid transitions', () => {
    const machine = new SessionStateMachine();
    assert.throws(
        () => machine.transition(SESSION_STATES.PAUSED),
        /Invalid session transition/
    );
});
