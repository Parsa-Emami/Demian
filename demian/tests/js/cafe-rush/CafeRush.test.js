import test from 'node:test';
import assert from 'node:assert/strict';
import CafeRushModel, { rushDistance } from '../../../resources/js/game/games/cafe-rush/CafeRushModel.js';
import {
    RECIPES, RUSH_DURATION, RUSH_GUESTS, RUSH_RULES, RUSH_SPOTS, RUSH_START, VIP_AT,
} from '../../../resources/js/game/games/cafe-rush/CafeRushMap.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';
import ArcadeWorld from '../../../resources/js/game/world/ArcadeWorld.js';
import DEMIAN_REFERENCE_CAFE_MANIFEST from '../../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';

const TICK = 1 / 60;
const spot = (id) => RUSH_SPOTS.find((item) => item.id === id);

function setup(t, difficulty = 'standard', variation = 0) {
    const model = new CafeRushModel();
    model.reset(difficulty, variation);
    t.after(() => model.dispose());
    return model;
}

function place(model, id) {
    const { x, z } = spot(id);
    model.ground.reset('player', { x, z });
    model.player.position = { x, z };
    model.player.speed = 0;
    model.velocity = { x: 0, z: 0 };
}

function waitForPrep(model, ticket) {
    while (ticket.state === 'preparing' && model.status === 'running') model.advance(TICK);
}

function prepare(model) {
    place(model, 'tickets');
    model.interact();
    const ticket = model.acceptedOrder;
    assert.ok(ticket);
    place(model, RECIPES[ticket.recipe].station);
    model.interact();
    assert.equal(ticket.state, 'preparing');
    waitForPrep(model, ticket);
    assert.equal(ticket.state, 'ready');
    model.interact();
    assert.equal(model.carriedOrder, ticket);
    return ticket;
}

function follow(model, id, run) {
    const target = spot(id);
    const path = model.ground.grid.findPath(model.player.position, target, { smooth: false });
    assert.ok(path.length);
    for (const point of path) {
        for (let index = 0; index < 110 && model.status === 'running'; index += 1) {
            const player = model.player.position;
            const length = rushDistance(point, player);
            if (length < .14) break;
            model.advance(TICK, { x: (point.x - player.x) / length, z: (point.z - player.z) / length, run });
            model.drainEvents();
        }
        if (model.status === 'running') assert.ok(rushDistance(point, model.player.position) < .14);
    }
    if (model.status === 'running') assert.equal(model.nearby()?.id, id);
}

test('Café Rush uses reachable stations, shipped café actors and a semantic touch surface', (t) => {
    const model = setup(t);
    for (const point of [RUSH_START, ...RUSH_SPOTS, ...Object.values(RUSH_GUESTS)]) {
        assert.equal(model.ground.canStand(point), true, point.id);
        assert.ok(model.ground.grid.findPath(RUSH_START, point).length);
    }
    const world = new ArcadeWorld({});
    const cabinet = world.cabinets.find((item) => item.gameId === 'cafe-rush');
    const counterSave = DEMIAN_REFERENCE_CAFE_MANIFEST.savePoints.find((point) => point.id === 'save-counter');
    assert.equal(cabinet.minimumFacing, -1);
    assert.equal(model.ground.canStand(cabinet.interaction), true);
    assert.ok(rushDistance(cabinet.interaction, counterSave.position) > cabinet.interaction.radius + 2.6);
    assert.equal(CONTROL_LAYOUTS.CAFE_RUSH.joystick, true);
    assert.equal(INPUT_CONTEXTS.CAFE_RUSH.analog.autoSprintAction, undefined);
    assert.deepEqual(Object.keys(INPUT_CONTEXTS.CAFE_RUSH.actions), ['run', 'interact', 'pause']);
    world.dispose();
});

test('shift rules freeze before confirmation and enforce the three queue capacities', (t) => {
    const model = setup(t);
    const levels = [['easy', 1, 4], ['standard', 2, 6], ['hard', 3, 8]];
    for (const [difficulty, capacity, quota] of levels) {
        model.reset(difficulty);
        model.advance(1, { x: 1, interact: true });
        assert.equal(model.remaining, RUSH_DURATION);
        assert.deepEqual(model.player.position, RUSH_START);
        assert.equal(model.orders.length, 0);
        assert.equal(model.rules.quota, quota);
        assert.equal(model.rules.capacity, capacity);
        model.start();
        let peak = 0;
        while (model.status === 'running') {
            model.advance(TICK);
            model.drainEvents();
            peak = Math.max(peak, model.orders.length);
        }
        assert.equal(peak, capacity);
        assert.equal(model.elapsed, 120);
        assert.equal(model.result().won, false);
        assert.equal(model.vipIssued, true);
        assert.equal(model.orders.length, 0);
    }
});

test('tickets require acceptance, the right station and completed preparation', (t) => {
    const model = setup(t);
    model.start();
    const order = model.orders[0];
    place(model, 'bar');
    model.interact();
    assert.equal(order.state, 'waiting');
    place(model, 'tickets');
    model.interact();
    assert.equal(order.state, 'accepted');
    place(model, 'pastry');
    model.interact();
    assert.equal(order.state, 'accepted');
    place(model, 'bar');
    model.interact();
    model.interact();
    assert.equal(order.state, 'preparing');
    assert.equal(model.tray, null);
    waitForPrep(model, order);
    model.interact();
    const tray = model.tray;
    model.interact();
    assert.equal(model.tray, tray);
    assert.equal(model.carriedOrder.id, order.id);
});

test('correct delivery earns 100 points and each third consecutive delivery adds 50', (t) => {
    const model = setup(t, 'hard');
    model.start();
    for (const expected of [100, 200, 350]) {
        while (!model.orders.length) model.advance(TICK);
        const ticket = prepare(model);
        place(model, `table-${ticket.table}`);
        model.interact();
        assert.equal(model.score, expected);
        assert.equal(model.tray, null);
    }
    assert.equal(model.result().bestCombo, 3);
});

test('wrong-table delivery resets the combo and leaves the correct order on the tray', (t) => {
    const model = setup(t);
    model.start();
    const ticket = prepare(model);
    model.combo = 2;
    place(model, `table-${ticket.table === 1 ? 2 : 1}`);
    model.interact();
    assert.equal(model.combo, 0);
    assert.equal(model.mistakes, 1);
    assert.equal(model.carriedOrder, ticket);
    assert.equal(model.score, 0);
    place(model, `table-${ticket.table}`);
    model.interact();
    assert.equal(model.score, 100);
    assert.equal(model.combo, 1);
});

test('an expired order clears the tray and resets the streak', (t) => {
    const model = setup(t);
    model.start();
    const ticket = prepare(model);
    model.combo = 2;
    model.elapsed = ticket.due - .005;
    model.advance(TICK);
    assert.equal(model.combo, 0);
    assert.equal(model.expired, 1);
    assert.equal(model.tray, null);
    assert.equal(model.orders.some((order) => order.id === ticket.id), false);
});

test('a sharp running turn spills the tray and the spill leaves slippery ground', (t) => {
    const model = setup(t);
    model.start();
    const ticket = prepare(model);
    model.combo = 2;
    place(model, 'tickets');
    model.advance(TICK, { x: 1, run: true });
    assert.equal(model.spills, 0);
    model.advance(TICK, { x: -1, run: true });
    assert.equal(model.spills, 1);
    assert.equal(model.combo, 0);
    assert.equal(model.tray, null);
    assert.equal(ticket.state, 'accepted');
    assert.equal(model.puddles.length, 1);
    const before = model.player.position.x;
    model.advance(TICK);
    assert.ok(model.player.position.x < before, 'slick ground retains momentum after input is released');
    model.advance(3);
    assert.equal(model.puddles.length, 1);
});

test('Uzudi arrives for the final thirty seconds and the pair earns 75 extra points', (t) => {
    const model = setup(t);
    model.start();
    model.elapsed = VIP_AT - .005;
    model.advance(TICK);
    const vip = model.orders.find((order) => order.vip);
    assert.equal(vip.recipe, 'vip');
    assert.equal(vip.table, 2);
    assert.equal(RECIPES[vip.recipe].kind, 'pair');
    assert.equal(prepare(model), vip);
    place(model, 'table-2');
    model.interact();
    assert.equal(model.score, 175);
    assert.equal(model.vipServed, true);
});

for (const difficulty of Object.keys(RUSH_RULES)) {
    for (let variation = 0; variation < 3; variation += 1) {
        test(`${difficulty} rotation ${variation + 1} meets its quota and serves the VIP through normal movement`, (t) => {
            const model = setup(t, difficulty, variation);
            model.start();
            while (model.status === 'running') {
                if (model.orders.length === 0) { model.advance(TICK); continue; }
                follow(model, 'tickets', true);
                model.interact();
                const ticket = model.acceptedOrder;
                if (!ticket) { model.advance(TICK); continue; }
                follow(model, RECIPES[ticket.recipe].station, true);
                model.interact();
                waitForPrep(model, ticket);
                model.interact();
                if (!model.tray) continue;
                follow(model, `table-${ticket.table}`, false);
                model.interact();
                model.drainEvents();
            }
            assert.ok(model.result().won);
            assert.ok(model.vipServed);
            assert.equal(model.spills, 0);
        });
    }
}
