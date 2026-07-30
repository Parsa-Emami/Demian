import test from 'node:test';
import assert from 'node:assert/strict';
import RoundTimer from '../../../resources/js/game/games/hide-and-seek/match/RoundTimer.js';

test('RoundTimer clamps elapsed time and exposes stable snapshots', () => {
    const timer = new RoundTimer(10).start();
    timer.tick(3.25);
    assert.equal(timer.remaining, 6.75);
    assert.equal(timer.expired, false);
    timer.tick(20);
    assert.equal(timer.remaining, 0);
    assert.equal(timer.expired, true);
    assert.equal(timer.running, false);
    assert.equal(timer.snapshot().progress, 1);
});
