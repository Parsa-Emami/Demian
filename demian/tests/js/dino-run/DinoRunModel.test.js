import test from 'node:test';
import assert from 'node:assert/strict';
import DinoRunModel, { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';

test('runner has a dedicated input context, no joystick and works in either orientation', () => {
    assert.equal(GAME_DEFINITIONS['dino-run'].inputContext, 'DINO_RUN');
    assert.equal(GAME_DEFINITIONS['dino-run'].orientation, 'any');
    assert.equal(CONTROL_LAYOUTS.DINO_RUN.joystick, false);
    assert.ok(INPUT_CONTEXTS.DINO_RUN.actions.duck);
    assert.ok(INPUT_CONTEXTS.DINO_RUN.actions.jumpHeld);
});
test('ready state is inert until the first jump and seed produces repeatable obstacles', () => {
    const a = new DinoRunModel({ seed: 7 }), b = new DinoRunModel({ seed: 7 });
    a.step(1 / 60); assert.equal(a.time, 0); assert.equal(a.status, 'ready');
    for (const model of [a, b]) {
        model.step(1 / 60, { jump: true, jumpHeld: true });
        for (let i = 0; i < 100; i++) model.step(1 / 60);
    }
    assert.deepEqual(a.obstacles, b.obstacles); assert.equal(a.score, b.score);
});
test('holding jump produces a taller jump, then landing resets vertical physics', () => {
    const short = new DinoRunModel(), tall = new DinoRunModel();
    let shortPeak = 0, tallPeak = 0;
    for (let i = 0; i < 70; i++) {
        short.step(1 / 60, { jump: i === 0, jumpHeld: false });
        tall.step(1 / 60, { jump: i === 0, jumpHeld: i < 30 });
        shortPeak = Math.max(shortPeak, short.y); tallPeak = Math.max(tallPeak, tall.y);
    }
    assert.ok(tallPeak > shortPeak + 25); assert.equal(tall.y, 0); assert.equal(tall.vy, 0);
});
test('standing hits a low bird; ducking passes it while remaining vulnerable to cactus', () => {
    for (const duck of [false, true]) {
        const model = new DinoRunModel(); model.status = 'running';
        model.obstacles = [{ x: RUNNER_CONFIG.playerX, previousX: RUNNER_CONFIG.playerX, y: 34, w: 40, h: 22 }];
        model.step(1 / 60, { duck });
        assert.equal(model.status, duck ? 'running' : 'over');
    }
    const model = new DinoRunModel(); model.status = 'running';
    model.obstacles = [{ x: RUNNER_CONFIG.playerX, previousX: RUNNER_CONFIG.playerX, y: 0, w: 26, h: 52 }];
    model.step(1 / 60, { duck: true }); assert.equal(model.status, 'over');
});
test('collision ends the session once, stops score and reset clears all previous state', () => {
    const model = new DinoRunModel(); model.status = 'running';
    model.obstacles = [{ x: RUNNER_CONFIG.playerX, previousX: RUNNER_CONFIG.playerX, y: 0, w: 26, h: 52 }];
    model.step(1 / 60); const score = model.score;
    model.step(1, { jump: true }); assert.equal(model.score, score);
    model.reset({ seed: 10 }); assert.equal(model.status, 'ready'); assert.equal(model.obstacles.length, 0);
    assert.equal(model.passed, 0); assert.equal(model.distance, 0);
});
test('interpolation remains between adjacent simulation positions and speed is capped', () => {
    const model = new DinoRunModel(); model.status = 'running'; model.time = 1000;
    model.step(1 / 60, { jump: true, jumpHeld: true });
    assert.equal(model.speed, RUNNER_CONFIG.maxSpeed);
    const middle = model.snapshot(.5);
    assert.equal(middle.y, (model.previous.y + model.y) / 2);
    assert.equal(middle.distance, (model.previous.distance + model.distance) / 2);
});
test('long seeded autoplay sessions stay playable with bounded obstacle memory at maximum speed', () => {
    for (const width of [420, 960]) {
        const model = new DinoRunModel({ seed: 127, width });
        model.step(1 / 60, { jump: true, jumpHeld: true });
        for (let i = 0; i < 60 * 180; i++) {
            const next = model.obstacles.find((o) => o.x + o.w > RUNNER_CONFIG.playerX - 14);
            const near = next && next.x - RUNNER_CONFIG.playerX < model.speed * .31;
            model.step(1 / 60, { jump: near && next.type === 'cactus' && model.y === 0,
                jumpHeld: true, duck: near && next.type === 'bird' });
            assert.equal(model.status, 'running', `unfair obstacle at ${model.time}s / width ${width}`);
            assert.ok(model.obstacles.length < 8);
        }
        assert.ok(model.passed > 80);
    }
});
