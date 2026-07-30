import test from 'node:test';
import assert from 'node:assert/strict';
import EventDirector from '../../../resources/js/game/games/event/core/EventDirector.js';
import cafeRush from '../../../resources/js/game/games/event/definitions/cafe-rush.json' with { type: 'json' };

function advance(director, seconds, step = 0.25) {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) director.fixedUpdate(step);
}

test('EventDirector runs countdown, dependencies, success, reward and results', () => {
    const events = [];
    const director = new EventDirector({ onEvent: (event) => events.push(event), outcomeDelay: 0.2 });
    director.prepare(cafeRush, { sessionId: 'session-1', seed: 'seed-1' });
    director.start();
    advance(director, 3.1);
    assert.equal(director.state, 'active');
    assert.equal(director.snapshot().objectives[1].status, 'locked');
    for (let index = 0; index < 8; index += 1) director.dispatch({ type: 'collect', item: 'coffee-cup' });
    assert.equal(director.snapshot().objectives[1].status, 'active');
    director.dispatch({ type: 'reach', zone: 'delivery-counter' });
    assert.equal(director.state, 'success');
    director.fixedUpdate(0.3);
    assert.equal(director.state, 'reward');
    director.acceptRewards({ id: 'receipt' });
    assert.equal(director.state, 'results');
    assert.ok(events.some((event) => event.type === 'objective-completed'));
});

test('EventDirector fails active events when duration expires', () => {
    const definition = structuredClone(cafeRush);
    definition.countdown = 0;
    definition.duration = 0.2;
    const director = new EventDirector({ outcomeDelay: 0 });
    director.prepare(definition);
    director.start();
    director.fixedUpdate(0.25);
    assert.equal(director.state, 'failed');
    assert.equal(director.snapshot().failureReason, 'time-expired');
});


test('EventDirector remembers semantic progress made before a dependent objective unlocks', () => {
    const director = new EventDirector({ outcomeDelay: 0 });
    const definition = structuredClone(cafeRush);
    definition.countdown = 0;
    director.prepare(definition);
    director.start();
    director.dispatch({ type: 'reach', zone: 'delivery-counter' });
    for (let index = 0; index < 8; index += 1) director.dispatch({ type: 'collect', item: 'coffee-cup' });
    assert.equal(director.state, 'success');
    assert.equal(director.snapshot().objectives[1].status, 'completed');
});

test('optional objectives do not block a successful event', () => {
    const definition = structuredClone(cafeRush);
    definition.countdown = 0;
    definition.objectives[1].required = false;
    const director = new EventDirector({ outcomeDelay: 0 });
    director.prepare(definition);
    director.start();
    for (let index = 0; index < 8; index += 1) {
        director.dispatch({ type: 'collect', item: 'coffee-cup' });
    }
    const snapshot = director.snapshot();
    assert.equal(snapshot.state, 'success');
    assert.equal(snapshot.objectives[1].required, false);
    assert.equal(snapshot.objectives[1].status, 'active');
});

