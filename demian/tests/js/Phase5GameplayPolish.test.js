import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import EventBus from '../../resources/js/game/core/EventBus.js';
import GameRuntime from '../../resources/js/game/runtime/GameRuntime.js';
import { safeCameraDamping } from '../../resources/js/game/core/CameraDamping.js';
import GameplayQualityProbe from '../../resources/js/game/quality/GameplayQualityProbe.js';
import DinoRunModel, { RUNNER_CONFIG, overlaps } from '../../resources/js/game/games/dino-run/DinoRunModel.js';
import AfterHoursModel from '../../resources/js/game/games/after-hours/AfterHoursModel.js';
import CafeRushModel from '../../resources/js/game/games/cafe-rush/CafeRushModel.js';
import CafeCrittersModel from '../../resources/js/game/games/cafe-critters/CafeCrittersModel.js';
import CoffeeCrashModel, { adjacent } from '../../resources/js/game/games/coffee-crash/CoffeeCrashModel.js';
import CafeDriftModel, { driftCourse, DRIFT } from '../../resources/js/game/games/cafe-drift/CafeDriftModel.js';
import { safeCafeTravelPosition, reconcileCafeDiscovery } from
    '../../resources/js/game/games/open-world/world/CafeTravelSafety.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('F5-01/F5-02: simulation uses fixed 60 Hz ticks and consumes one-shot intent only once', () => {
    const snapshots = [];
    const steps = [];
    const bus = new EventBus();
    const runtime = new GameRuntime({
        inputRouter: { snapshot: options => {
            snapshots.push(options.consumePresses);
            return { jump: options.consumePresses, interact: options.consumePresses };
        }},
        eventBus: bus,
        fixedStep: 1 / 60,
        maxFrameDelta: 0.045,
        maxSubSteps: 5,
        visibilityTarget: null,
        canRender: () => true,
    });
    runtime.currentGame = {
        fixedUpdate: (dt, input) => steps.push({ dt, input }),
        update: () => {},
        render: () => true,
    };
    runtime.step(1 / 30);
    assert.equal(steps.length, 2);
    assert.deepEqual(snapshots, [true, false]);
    assert.deepEqual(steps.map(x => x.input.jump), [true, false]);
    assert.ok(steps.every(x => x.dt === 1 / 60));
    runtime.dispose();
});

test('F5-04: camera smoothing stays finite, monotone and independent of rendering spikes', () => {
    assert.equal(safeCameraDamping(7.5, -1), 0);
    assert.equal(safeCameraDamping(7.5, NaN), 0);
    assert.equal(safeCameraDamping(7.5, Infinity), 0);
    assert.equal(safeCameraDamping(0, .016), 0);
    const small = safeCameraDamping(7.5, 1 / 120);
    const normal = safeCameraDamping(7.5, 1 / 60);
    assert.ok(small > 0 && normal > small && normal < 1);
    assert.ok(Math.abs(1 - (1 - small) ** 2 - normal) < 1e-12);
    assert.equal(safeCameraDamping(7.5, 3), safeCameraDamping(7.5, .15));
});

test('F5-06: only explicitly resettable games use in-place restart, never the persistent world', () => {
    const app = read('../../resources/js/game/application/GameApplication.js');
    assert.match(app, /this\.activeGame\?\.supportsInPlaceRestart === true/);
    assert.match(app, /forceReload: !inPlace, restart: true/);
    const enabled = ['dino-run/DinoRunGame', 'cafe-critters/CafeCrittersGame',
        'coffee-crash/CoffeeCrashGame', 'cafe-drift/CafeDriftGame'];
    for (const file of enabled) {
        assert.match(read('../../resources/js/game/games/' + file + '.js'), /supportsInPlaceRestart = true/);
    }
    for (const file of ['open-world/OpenWorldGame', 'after-hours/AfterHoursGame',
        'cafe-rush/CafeRushGame']) {
        assert.doesNotMatch(read('../../resources/js/game/games/' + file + '.js'), /supportsInPlaceRestart = true/);
    }
    assert.match(read('../../resources/js/game/games/coffee-crash/CoffeeCrashGame.js'),
        /this\.contentWeek === weeklyIndex\(\)/);
});

test('F5-07: on-demand QA counters use actual sessions without score, player or network fields', () => {
    const bus = new EventBus();
    let now = 100;
    const probe = new GameplayQualityProbe({ eventBus: bus, clock: () => now });
    const initial = probe.snapshot()['dino-run'];
    assert.equal(initial.observedWinRate, null);
    bus.emit('game:session-started', { gameId: 'dino-run', player_id: 'ignore-me' });
    now = 400;
    bus.emit('runtime:frame-drop', { droppedSeconds: 0.04 });
    bus.emit('game:completed', { gameId: 'dino-run', won: true, score: 1234 });
    bus.emit('game:session-started', { gameId: 'dino-run' });
    now = 550;
    bus.emit('game:completed', { gameId: 'dino-run', won: false });
    const stats = probe.snapshot()['dino-run'];
    assert.deepEqual([stats.starts, stats.completions, stats.wins, stats.retries],
        [2, 2, 1, 1]);
    assert.equal(stats.observedWinRate, .5);
    assert.equal(stats.elapsedSessionMs, 450);
    assert.equal(stats.droppedFrameSeconds, .04);
    assert.doesNotMatch(JSON.stringify(probe.snapshot()), /ignore-me|player_id|token|1234/);
    probe.dispose();
    bus.emit('game:session-started', { gameId: 'dino-run' });
    assert.equal(probe.snapshot()['dino-run'].starts, 2);
});

test('Dino Run: fixed-seed hazards and outcomes are stable at 60 Hz', () => {
    const a = new DinoRunModel({ seed: 177, width: 420 });
    const b = new DinoRunModel({ seed: 177, width: 420 });
    a.status = b.status = 'running';
    for (let tick = 0; tick < 220; tick++) {
        const input = { jump: tick === 3, jumpHeld: tick > 3 && tick < 11, duck: false };
        a.step(1 / 60, input);
        b.step(1 / 60, input);
        assert.deepEqual([a.status, a.score, a.passed, a.y, a.vy, a.spawnIn],
            [b.status, b.score, b.passed, b.y, b.vy, b.spawnIn]);
        if (a.status === 'over') break;
    }
    assert.equal(a.width, 420);
    assert.ok(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 1, h: 10 }));
    assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 1, h: 10 }), false);
    assert.ok(Number.isFinite(RUNNER_CONFIG.jumpSpeed));
});

test('Open World: invalid or disconnected saved positions fail closed, discovery is pruned', () => {
    const fallback = { x: 0, z: 0 };
    const blocked = {
        worldToCell: () => ({ x: 0, z: 0 }),
        isWalkable: () => false, findPath: () => [], nearestWalkable: () => null,
    };
    for (const invalid of [null, {}, { x: NaN, z: 1 }, { x: Infinity, z: 0 }]) {
        assert.deepEqual(safeCafeTravelPosition(invalid, blocked, fallback), fallback);
    }
    const events = [];
    const discovery = {
        export: () => ({ unlockedSavePoints: ['save-entrance', 'old-save'],
            discoveredChunks: ['room-1', 'ghost-room'] }),
        import: data => events.push(['import', data]),
        unlockSavePoint: id => events.push(['unlock', id]),
        discoverChunk: id => events.push(['chunk', id]),
    };
    const manifest = {
        savePoint: id => id === 'save-entrance' ? { chunkId: 'room-1' } : null,
        chunk: id => id === 'room-1' ? { id } : null,
    };
    reconcileCafeDiscovery(discovery, manifest, { legacyLayout: true });
    assert.deepEqual(events[0][1], { discoveredChunks: [], unlockedSavePoints: ['save-entrance'] });
    assert.ok(events.some(([type, id]) => type === 'unlock' && id === 'save-entrance'));
    assert.ok(events.some(([type, id]) => type === 'chunk' && id === 'room-1'));
});

test('After Hours: time limit, diagonal movement and terminal state do not double-award points', () => {
    const m = new AfterHoursModel();
    try {
        m.reset('standard', 0);
        m.start();
        m.advance(1 / 60, { x: 1, z: 1 });
        assert.ok(m.player.speed <= 10.8 + 1e-7, 'diagonal sprint must not exceed max speed');
        m.advance(m.rules.duration + 1);
        assert.equal(m.status, 'timeout');
        const result = m.result();
        assert.equal(result.won, false);
        const before = m.drainEvents().length;
        m.advance(1, { interact: true });
        assert.equal(m.drainEvents().length, 0);
        assert.ok(before >= 1);
    } finally { m.dispose(); }
});

test('Café Rush: wrong table cannot serve twice, and end-of-shift stops interaction', () => {
    const m = new CafeRushModel();
    try {
        m.start();
        m.orders = [{
            id: 1, recipe: 'tea', table: 1, vip: false,
            state: 'carrying', due: 100, readyAt: 0,
        }];
        m.tray = { orderId: 1, risk: 0, lean: 0 };
        m.serve({ kind: 'table', table: 2 });
        assert.equal(m.mistakes, 1);
        assert.equal(m.delivered, 0);
        m.serve({ kind: 'table', table: 1 });
        assert.equal(m.delivered, 1);
        const awarded = m.score;
        m.serve({ kind: 'table', table: 1 });
        assert.equal(m.score, awarded, 'same order cannot be redeemed twice');
        m.elapsed = 119.99;
        m.advance(.05);
        assert.equal(m.status, 'finished');
        const endScore = m.score;
        m.interact();
        assert.equal(m.score, endScore);
    } finally { m.dispose(); }
});

test('Café Critters: valid table can be found once, cannot duplicate album progress', () => {
    const m = new CafeCrittersModel('standard', [], 0);
    m.start();
    const guest = m.guest;
    assert.ok(guest);
    for (const [field, value] of Object.entries(guest.setting)) {
        assert.equal(m.select(field, value), true);
    }
    const feedback = m.invite();
    assert.equal(feedback.type, 'discovery');
    assert.equal(m.invite(), null);
    assert.equal(m.found, 1);
    assert.equal(m.album.has(guest.id), true);
    const known = [...m.album];
    m.reset('standard', known, 0);
    assert.equal(m.album.has(guest.id), true);
});

test('Coffee Crash: seeded board always has a move; an invalid swap is free', () => {
    for (const seed of [1, 77, 113, 4301]) {
        const model = new CoffeeCrashModel();
        model.rng = seed;
        model.generate();
        assert.ok(model.findMove(), 'every initial board must be solvable: ' + seed);
        const oldScore = model.score, oldMoves = model.moves;
        assert.equal(model.swap(-1, 999).accepted, false);
        assert.equal(model.score, oldScore);
        assert.equal(model.moves, oldMoves);
        const move = model.findMove();
        assert.equal(adjacent(...move), true);
    }
});

test('Café Drift: steering stays in bounds, impossible inputs cannot poison replay state', () => {
    const a = new CafeDriftModel(7415), b = new CafeDriftModel(7415);
    assert.deepEqual(driftCourse(7415), driftCourse(7415));
    assert.ok(a.gates.length > 0);
    for (const gate of a.gates) {
        assert.ok(gate.obstacles.length < DRIFT.lanes.length,
            'each gate needs a legal path');
    }
    for (let tick = 0; tick < 120; tick++) {
        a.step(0);
        b.step(tick % 2 ? NaN : Infinity);
        assert.deepEqual([a.x, a.velocity, a.tick, a.score, a.cups],
            [b.x, b.velocity, b.tick, b.score, b.cups]);
    }
    const c = new CafeDriftModel(7415);
    for (let tick = 0; tick < 100; tick++) c.step(1e10);
    assert.ok(Number.isFinite(c.x));
    assert.ok(Math.abs(c.x) <= DRIFT.targetMax * DRIFT.targetUnit);
    assert.ok(Number.isSafeInteger(c.score));
    const control = read('../../resources/js/game/games/cafe-drift/CafeDriftGame.js');
    assert.match(control, /resetPointer\(\)/);
    assert.match(control, /pointercancel/);
    assert.match(control, /invalidateRanking\(\)/);
});
