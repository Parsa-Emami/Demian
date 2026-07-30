import test from 'node:test';
import assert from 'node:assert/strict';
import AiBudgetScheduler from '../../../resources/js/game/games/open-world/entities/AiBudgetScheduler.js';

test('AI budget maps distance to deterministic update bands', () => {
    const scheduler = new AiBudgetScheduler({ maxUpdatesPerFrame: 10 });
    scheduler.beginFrame();
    assert.equal(scheduler.take('near', 1 / 30, 5).band, 'near');
    assert.equal(scheduler.take('visible', 1 / 15, 25).band, 'visible');
    assert.equal(scheduler.take('distant', 1 / 5, 60).band, 'distant');
    const dormant = scheduler.take('dormant', 1, 200);
    assert.equal(dormant.band, 'dormant');
    assert.equal(dormant.render, false);
    assert.equal(dormant.simulateOnly, true);
});

test('AI budget accumulates elapsed time and respects per-frame cap', () => {
    const scheduler = new AiBudgetScheduler({ maxUpdatesPerFrame: 1 });
    scheduler.beginFrame();
    const first = scheduler.take('a', 1 / 30, 2);
    const second = scheduler.take('b', 1 / 30, 2);
    assert.equal(first.update, true);
    assert.equal(second.update, false);
    scheduler.beginFrame();
    assert.equal(scheduler.take('b', 0, 2).update, true);
});

test('AI budget promotes a dormant actor when it returns near the player', () => {
    const scheduler = new AiBudgetScheduler({ maxUpdatesPerFrame: 4 });
    scheduler.beginFrame();
    assert.equal(scheduler.take('npc', 1, 200).band, 'dormant');
    scheduler.beginFrame();
    const promoted = scheduler.take('npc', 1 / 30, 3);
    assert.equal(promoted.band, 'near');
    assert.equal(promoted.render, true);
    assert.equal(promoted.update, true);
});
