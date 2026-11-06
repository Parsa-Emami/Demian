import test from 'node:test';
import assert from 'node:assert/strict';
import DinoRunModel, { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';

const dt = 1 / RUNNER_CONFIG.tickRate;
const attackAtPlayer = (slug, response) => ({ id: 0, type: 'attacker', attacker: slug, response,
    appearance: response === 'duck' ? 'pounce' : 'charge', x: RUNNER_CONFIG.playerX, previousX: RUNNER_CONFIG.playerX,
    y: response === 'duck' ? 44 : 0, w: 40, h: RUNNER_CONFIG.bodyHeight, scored: false });

test('fast opening puts the first threat within reach immediately on phone and wide screens', () => {
    for (const width of [420, 960, 2560]) {
        const model = new DinoRunModel({ seed: 7, width });
        model.step(dt, { jump: true });
        while (!model.obstacles.length) model.step(dt);
        assert.ok(model.time <= .25);
        assert.ok(model.speed >= 450);
        assert.ok((model.obstacles[0].x - RUNNER_CONFIG.playerX) / model.speed <= 1.05);
        assert.ok(model.obstacles.every(o => o.x > RUNNER_CONFIG.playerX + 250));
    }
});

test('seeded encounters include both attackers, both attacks and all twelve distinct props', () => {
    const collect = (seed) => {
        const model = new DinoRunModel({ seed });
        const encounters = [];
        for (let i = 0; i < 300; i++) {
            model.spawn(); encounters.push(...model.obstacles); model.obstacles = [];
        }
        return encounters;
    };
    const first = collect(123456);
    assert.deepEqual(first, collect(123456));
    assert.notDeepEqual(first, collect(654321));
    assert.deepEqual([...new Set(first.filter(o => o.attacker).map(o => o.attacker))].sort(), ['amirreza', 'uzudi']);
    for (const slug of RUNNER_CONFIG.attackers) {
        assert.deepEqual([...new Set(first.filter(o => o.attacker === slug).map(o => o.response))].sort(), ['duck', 'jump']);
    }
    const props = first.filter(o => !o.attacker);
    assert.equal(new Set(props.map(o => o.appearance)).size, 12);
    assert.ok(new Set(props.filter(o => o.appearance === 'chair').map(o => `${o.w}/${o.h}`)).size > 2);
    assert.ok(first.filter(o => o.attacker).length > 50);
});

test('each attacker ends the run on contact and can be avoided by the matching move', () => {
    for (const slug of RUNNER_CONFIG.attackers) for (const response of ['jump', 'duck']) {
        const idle = new DinoRunModel(); idle.status = 'running'; idle.obstacles = [attackAtPlayer(slug, response)];
        idle.step(dt);
        assert.equal(idle.status, 'over'); assert.equal(idle.endReason, 'attack'); assert.equal(idle.hitBy, slug);
        const escaped = new DinoRunModel(); escaped.status = 'running'; escaped.obstacles = [attackAtPlayer(slug, response)];
        if (response === 'jump') escaped.y = 100;
        escaped.step(dt, { duck: response === 'duck' });
        assert.equal(escaped.status, 'running');
    }
});

test('swept attack contact is lethal during a slow frame and a finished run stays frozen', () => {
    const model = new DinoRunModel(); model.status = 'running';
    const attack = attackAtPlayer('amirreza', 'jump'); attack.x += 24; attack.previousX = attack.x;
    model.obstacles = [attack]; model.step(.05);
    assert.equal(model.endReason, 'attack');
    const result = { score: model.score, time: model.time, tick: model.tick, x: attack.x };
    model.step(.05, { jump: true, duck: true });
    assert.deepEqual({ score: model.score, time: model.time, tick: model.tick, x: attack.x }, result);
    model.reset({ seed: 12 });
    assert.equal(model.hitBy, null); assert.equal(model.lastAppearance, null);
    assert.equal(model.endReason, null); assert.deepEqual(model.obstacles, []);
});

test('hard mixed courses remain avoidable across seeds and track widths with bounded memory', () => {
    for (const seed of [1, 7, 55, 127, 8123, 4294967295]) for (const width of [420, 960, 2560]) {
        const model = new DinoRunModel({ seed, width });
        model.step(dt, { jump: true, jumpHeld: true });
        for (let tick = 0; tick < 60 * 180; tick++) {
            const next = model.obstacles.find(o => o.x + o.w > RUNNER_CONFIG.playerX - 14);
            const near = next && next.x - RUNNER_CONFIG.playerX < model.speed * .31;
            model.step(dt, { jump: Boolean(near && next.response === 'jump' && model.y === 0),
                jumpHeld: true, duck: Boolean(near && next.response === 'duck') });
            assert.equal(model.status, 'running', `${seed}/${width}/${model.time}`);
            assert.ok(model.obstacles.length <= 10);
        }
    }
});
