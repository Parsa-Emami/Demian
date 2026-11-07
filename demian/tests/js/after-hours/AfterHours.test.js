import test from 'node:test';
import assert from 'node:assert/strict';
import AfterHoursModel from '../../../resources/js/game/games/after-hours/AfterHoursModel.js';
import {
    CIRCUITS, SHIFT_EXIT, SHIFT_LAYOUTS, SHIFT_LOCKER, SHIFT_PANELS, SHIFT_RULES, SHIFT_START, distance,
} from '../../../resources/js/game/games/after-hours/AfterHoursMap.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';
import ArcadeWorld from '../../../resources/js/game/world/ArcadeWorld.js';

const TICK = 1 / 60;

function setup(t, difficulty = 'standard', layout = 0) {
    const model = new AfterHoursModel();
    model.reset(difficulty, layout);
    t.after(() => model.dispose());
    return model;
}

function place(model, target) {
    const point = { x: target.x, z: target.z };
    model.terrain.reset('player', point);
    model.player.position = point;
}

function followPath(model, target, run = true) {
    const points = model.terrain.grid.findPath(model.player.position, target, { smooth: false });
    assert.ok(points.length, 'the target is reachable on the canonical café floor');
    for (const waypoint of points) {
        for (let step = 0; step < 100; step += 1) {
            assert.equal(model.status, 'running');
            const player = model.player.position;
            const gap = distance(player, waypoint);
            if (gap < 0.14) break;
            model.advance(TICK, { x: (waypoint.x - player.x) / gap, z: (waypoint.z - player.z) / gap, run });
            model.drainEvents();
        }
        assert.ok(distance(model.player.position, waypoint) < 0.14, 'no collider blocks the tested route');
    }
    assert.equal(model.nearby()?.id, target.id);
}

test('After Hours has a café entrance and a dedicated silent-walk touch context', () => {
    const world = new ArcadeWorld({});
    const entry = world.cabinets.find((cabinet) => cabinet.gameId === 'after-hours');
    assert.ok(entry?.interaction.radius > 0);
    assert.equal(entry.minimumFacing, -1);
    assert.equal(CONTROL_LAYOUTS.AFTER_HOURS.joystick, true);
    assert.equal(INPUT_CONTEXTS.AFTER_HOURS.analog.autoSprintAction, undefined);
    assert.deepEqual(Object.keys(INPUT_CONTEXTS.AFTER_HOURS.actions), ['run', 'interact', 'pause']);
    world.dispose();
});

test('the two difficulties hold their timers until confirmation and expire at 5 and 4 minutes', (t) => {
    const model = setup(t);
    for (const [difficulty, limit] of [['standard', 300], ['hard', 240]]) {
        model.reset(difficulty);
        model.advance(1, { x: 1, run: true });
        assert.equal(model.remaining, limit);
        assert.deepEqual(model.player.position, SHIFT_START);
        model.start();
        model.elapsed = limit - 0.01;
        model.advance(TICK);
        assert.equal(model.remaining, 0);
        assert.equal(model.result().reason, 'timeout');
    }
    assert.ok(SHIFT_RULES.hard.reaction < SHIFT_RULES.standard.reaction);
    assert.ok(SHIFT_RULES.hard.hearing > SHIFT_RULES.standard.hearing);
    assert.ok(SHIFT_RULES.hard.chaseSpeed > SHIFT_RULES.standard.chaseSpeed);
});

test('only a nearby panel can change the two powered circuits and the exit checks cards and electricity', (t) => {
    const model = setup(t);
    model.start();
    assert.equal(model.switchPower('exit'), false);
    place(model, SHIFT_EXIT);
    model.interact();
    assert.equal(model.status, 'running');
    place(model, SHIFT_PANELS[0]);
    assert.equal(model.interact().id, SHIFT_PANELS[0].id);
    assert.equal(model.switchPower('exit'), true);
    assert.equal(model.switchPower('unknown'), false);
    assert.equal(CIRCUITS.filter((circuit) => circuit.id !== model.darkCircuit).length, 2);
    for (const card of model.cards) {
        place(model, card);
        model.interact();
        model.interact();
    }
    assert.equal(model.cardCount, 2);
    place(model, SHIFT_EXIT);
    model.interact();
    assert.equal(model.status, 'running');
    place(model, SHIFT_PANELS[0]);
    assert.equal(model.switchPower('storage'), true);
    place(model, SHIFT_EXIT);
    model.interact();
    assert.equal(model.result().won, true);
});

test('the powered locker is noisy and losing the run forfeits its relic', (t) => {
    const model = setup(t, 'hard');
    model.start();
    place(model, SHIFT_LOCKER);
    model.interact();
    assert.equal(model.relic, false);
    place(model, SHIFT_PANELS[1]);
    model.switchPower('exit');
    place(model, SHIFT_LOCKER);
    model.interact();
    assert.equal(model.relic, true);
    assert.equal(model.noise.kind, 'metal');
    assert.equal(model.noise.radius, 14 * SHIFT_RULES.hard.hearing);
    model.elapsed = model.rules.grace + 1;
    model.shadow.position = { ...model.player.position };
    model.terrain.reset('shadow', model.shadow.position);
    model.advance(TICK);
    assert.equal(model.result().reason, 'caught');
    assert.equal(model.result().securedRelic, false);
});

for (const difficulty of Object.keys(SHIFT_RULES)) {
    for (let layout = 0; layout < SHIFT_LAYOUTS.length; layout += 1) {
        test(`${difficulty} layout ${layout + 1} can be won with the relic using simulated movement and interactions`, (t) => {
            const model = setup(t, difficulty, layout);
            model.start();
            followPath(model, SHIFT_PANELS[0], false);
            assert.equal(model.switchPower(layout === 1 ? 'exit' : 'counter'), true);
            for (const card of model.cards) {
                followPath(model, card);
                model.interact();
            }
            followPath(model, SHIFT_LOCKER);
            model.interact();
            if (layout === 1) {
                followPath(model, SHIFT_PANELS[1]);
                assert.equal(model.switchPower('storage'), true);
            }
            followPath(model, SHIFT_EXIT);
            model.interact();
            assert.equal(model.result().won, true);
            assert.equal(model.result().securedRelic, true);
        });
    }
}
