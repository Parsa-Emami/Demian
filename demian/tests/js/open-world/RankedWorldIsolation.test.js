import test from 'node:test';
import assert from 'node:assert/strict';
import OpenWorldGame from '../../../resources/js/game/games/open-world/OpenWorldGame.js';

function world(state = 'running') {
    const game = new OpenWorldGame();
    const calls = { save:0, checkpoint:[], toast:[], travel:0 };
    const point = { id:'save-counter', label:'پیشخوان', position:{x:3.24,z:-30.6} };
    const actions = [];
    game.world = { cabinets: [] };
    game.manifest = { savePoints:[point] };
    game.interactionScope = { register: action => actions.push(action) };
    game.savePoints = { activate:() => calls.save++ };
    game.routeChallenge = { state, checkpoint: id => {
        calls.checkpoint.push(id);
        return id === point.id;
    }};
    game.context = { app:{shell:{toast:(message,status) => calls.toast.push([message,status])}} };
    game.discovery = { isSavePointUnlocked: () => true };
    game.registerWorldInteractions();
    return { game, point, calls, action:actions[0].action };
}

test('ranked world interaction advances ephemeral proof without altering local saves', () => {
    const {game, point, calls, action} = world();
    assert.equal(game.worldChallengeLocked(), true);
    assert.equal(action(), true);
    assert.deepEqual(calls.checkpoint, [point.id]);
    assert.equal(calls.save, 0);
    game.routeChallenge.checkpoint = () => false;
    assert.equal(action(), false);
    assert.equal(calls.save, 0);
});

test('practice world still persists save points and never creates ranked evidence', () => {
    const {game, calls, action} = world('idle');
    assert.equal(game.worldChallengeLocked(), false);
    assert.equal(action(), true);
    assert.equal(calls.save, 1);
    assert.deepEqual(calls.checkpoint, []);
});

test('competitive world disallows fast travel, including pending submissions and startup', async () => {
    for (const state of ['starting', 'running', 'submitting']) {
        const {game, point, calls} = world(state);
        assert.equal(await game.fastTravel(point), false);
        assert.equal(calls.toast.length, 1);
    }
});

test('the world map cannot be opened while the ranked clock is active', () => {
    const {game} = world('running');
    let closed = 0;
    game.hud = { closeMap: () => closed++ };
    game.setMapOpen(true);
    assert.equal(game.mapOpen, false);
    assert.equal(closed, 1);
    game.routeChallenge.state = 'idle';
    game.context.root = { dataset:{} };
    game.context.input = { clearTouch:()=>{} };
    game.setMapOpen(true);
    assert.equal(game.mapOpen, true);
});
