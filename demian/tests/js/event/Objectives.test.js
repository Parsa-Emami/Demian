import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjective } from '../../../resources/js/game/games/event/objectives/ObjectiveFactory.js';

 test('collect, reach, defeat and score objectives consume semantic events', () => {
    const collect = createObjective({ id: 'c', type: 'collect', item: 'cup', amount: 2 });
    collect.apply({ type: 'collect', item: 'cup' });
    assert.equal(collect.completed, false);
    collect.apply({ type: 'collect', item: 'cup' });
    assert.equal(collect.completed, true);

    const reach = createObjective({ id: 'r', type: 'reach', zone: 'finish' });
    reach.apply({ type: 'reach', zone: 'finish' });
    assert.equal(reach.completed, true);

    const defeat = createObjective({ id: 'd', type: 'defeat', enemy: 'drone', amount: 1 });
    defeat.apply({ type: 'defeat', enemy: 'drone' });
    assert.equal(defeat.completed, true);

    const score = createObjective({ id: 's', type: 'score', amount: 100 });
    score.apply({ type: 'score', total: 120 });
    assert.equal(score.completed, true);
});

test('survive objective advances only while active', () => {
    const survive = createObjective({ id: 'survive', type: 'survive', seconds: 2 });
    survive.update(1);
    assert.equal(survive.completed, false);
    survive.update(1);
    assert.equal(survive.completed, true);
});

test('dependent objective remains locked until activated', () => {
    const objective = createObjective({ id: 'reach', type: 'reach', zone: 'exit', requires: ['collect'] });
    assert.equal(objective.status, 'locked');
    assert.equal(objective.apply({ type: 'reach', zone: 'exit' }), false);
    objective.activate();
    assert.equal(objective.status, 'active');
});
