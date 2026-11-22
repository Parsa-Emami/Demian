import assert from 'node:assert/strict';
import test from 'node:test';
import CafeDriftModel, { DRIFT, driftCourse, driftSeed } from '../../../resources/js/game/games/cafe-drift/CafeDriftModel.js';

test('weekly drift courses rotate at the Tehran Saturday boundary and always offer safe lanes', () => {
    const justBefore = Date.parse(DRIFT.weekEpoch) - 1;
    const first = driftSeed(justBefore);
    assert.deepEqual(driftCourse(first), driftCourse(driftSeed(justBefore - 10_000)));
    assert.notDeepEqual(driftCourse(first), driftCourse(driftSeed(justBefore + 1)));
    for (let seed = first; seed < first + 104; seed++) {
        const gates = driftCourse(seed);
        assert.ok(gates.length >= 39);
        for (const [i, gate] of gates.entries()) {
            assert.ok(gate.tick + DRIFT.contactTicks <= DRIFT.ticks);
            assert.ok(DRIFT.lanes.some(lane => gate.obstacles.every(obstacle => Math.abs(obstacle.x - lane) > DRIFT.near)));
            if (gate.bean !== null) assert.ok(gate.obstacles.every(obstacle => obstacle.x !== gate.bean));
            if (i) assert.ok(gate.tick - gates[i - 1].tick >= DRIFT.minimumGap - 6);
        }
    }
});

test('steering is bounded and safe passes, near misses, beans and collisions drive a real combo', () => {
    const model = new CafeDriftModel(4096);
    const advance = (index, desired) => {
        const end = model.gates[index].tick + DRIFT.contactTicks;
        let cue;
        while (model.tick < end) {
            cue = model.step(desired / DRIFT.targetUnit);
            assert.ok(Math.abs(model.velocity) <= DRIFT.maxSpeed);
            assert.ok(Math.abs(model.x) <= DRIFT.targetMax * DRIFT.targetUnit);
        }
        return cue;
    };
    for (const i of [0, 1]) {
        const obstacle = model.gates[i].obstacles[0].x;
        assert.equal(advance(i, obstacle + (obstacle < 0 ? 700 : -700)), 'near');
    }
    assert.equal(model.combo, 2);
    assert.equal(model.score, 2 * DRIFT.passPoints + 3 * DRIFT.nearPoints);
    const bean = model.gates[2].bean;
    assert.equal(advance(2, bean), 'bean');
    assert.equal(model.combo, 3);
    assert.equal(model.beans, 1);
    assert.equal(advance(3, model.gates[3].obstacles[0].x), 'hit');
    assert.equal(model.cups, 2);
    assert.equal(model.combo, 0);
    assert.equal(model.bestCombo, 3);
});

test('a lost round freezes on the final spill and a completed shift earns a remaining-cup bonus once', () => {
    const lost = new CafeDriftModel(4096);
    while (!lost.done) lost.step(lost.gates[lost.index].obstacles[0].x / DRIFT.targetUnit);
    assert.equal(lost.cups, 0);
    const end = lost.tick;
    assert.equal(lost.step(0), null);
    assert.equal(lost.tick, end);

    const survived = new CafeDriftModel(4096);
    while (!survived.done) {
        const gate = survived.gates[survived.index];
        const lane = gate && DRIFT.lanes.find(lane => gate.obstacles.every(obstacle => Math.abs(obstacle.x - lane) > DRIFT.near));
        survived.step((lane ?? 0) / DRIFT.targetUnit);
    }
    assert.equal(survived.tick, DRIFT.ticks);
    assert.equal(survived.cups, DRIFT.cups);
    assert.equal(survived.score, survived.passed * DRIFT.passPoints + survived.beans * DRIFT.beanPoints + DRIFT.cups * DRIFT.cupBonus);
});
