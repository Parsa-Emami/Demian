import test from 'node:test';
import assert from 'node:assert/strict';
import CoffeeCrashModel, { adjacent, findRuns } from '../../../resources/js/game/games/coffee-crash/CoffeeCrashModel.js';
import CoffeeCrashStore from '../../../resources/js/game/games/coffee-crash/CoffeeCrashStore.js';
import { COLS, ROWS, LEVELS } from '../../../resources/js/game/games/coffee-crash/CoffeeCrashData.js';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';

const patterned = () => Array.from({ length: COLS * ROWS }, (_, i) => ({ type: (i % COLS + Math.floor(i / COLS) * 2) % 5, special: null }));
const setup = () => { const model = new CoffeeCrashModel(); model.board = patterned(); return model; };

test('all twelve level seeds start stable, deterministic and with legal moves', () => {
    for (const level of LEVELS) {
        const first = new CoffeeCrashModel(level.id);
        assert.equal(first.board.length, 56);
        assert.deepEqual(first.board, new CoffeeCrashModel(level.id).board);
        assert.deepEqual(findRuns(first.board), []);
        assert.ok(first.findMove());
        assert.equal(first.moves, level.moves);
    }
});

test('invalid and nonadjacent swaps preserve all state and consume no random numbers', () => {
    const model = setup();
    assert.equal(adjacent(6, 7), false);
    assert.equal(adjacent(-1, 0), false);
    assert.equal(adjacent(0, 7), true);
    for (const pair of [[0, 1], [0, 2], [6, 7], [0, 56]]) {
        const before = model.snapshot();
        assert.equal(model.swap(...pair).accepted, false);
        assert.deepEqual(model.snapshot(), before);
    }
});

test('accepted moves settle fully and exact undo restores the random stream', () => {
    const model = new CoffeeCrashModel();
    const before = model.snapshot();
    const move = model.findMove();
    const result = model.swap(...move);
    assert.equal(result.accepted, true);
    assert.equal(model.moves, before.moves - 1);
    assert.ok(model.score > 0);
    assert.ok(model.collected.reduce((a, b) => a + b, 0) >= 3);
    assert.deepEqual(findRuns(model.board), []);
    assert.ok(model.findMove());
    const after = model.snapshot();
    assert.equal(model.undo(), true);
    assert.deepEqual(model.snapshot(), before);
    assert.equal(model.undo(), false);
    model.swap(...move);
    assert.deepEqual(model.snapshot(), after);
});

test('straight four, straight five and intersecting runs create the correct specials', () => {
    for (const [indices, special] of [[[0, 1, 2, 3], 'row'], [[0, 7, 14, 21], 'column'], [[0, 1, 2, 3, 4], 'rainbow'], [[1, 8, 14, 15, 16], 'bomb']]) {
        const model = setup();
        model.board = Array(COLS * ROWS).fill(null);
        indices.forEach(i => model.board[i] = { type: 4, special: null });
        const made = model.creations(findRuns(model.board), [indices[1]]);
        assert.ok(made.some(item => item.special === special), JSON.stringify(made));
        assert.equal(new Set(made.map(item => item.index)).size, made.length);
    }
});

test('power effects chain once, remain inside board bounds and do not wrap at edges', () => {
    const model = setup();
    model.board[0].special = 'bomb';
    const edge = new Set([0]);
    model.expand(edge);
    assert.deepEqual([...edge].sort((a, b) => a - b), [0, 1, 7, 8]);
    model.board[1].special = 'row';
    model.board[3].special = 'column';
    const chain = new Set([0]);
    model.expand(chain);
    assert.ok(chain.has(52));
    assert.ok(chain.has(6));
    assert.equal(chain.has(55), false);
    assert.equal(chain.size, new Set(chain).size);
});

test('a rainbow swap collects the target color without requiring a match', () => {
    const model = setup();
    model.board[0].special = 'rainbow';
    const target = model.board[1].type;
    const expected = model.board.filter(tile => tile.type === target).length;
    assert.equal(model.swap(0, 1).accepted, true);
    assert.ok(model.collected[target] >= expected);
    assert.equal(model.moves, model.level.moves - 1);
});

test('two rainbow cups clear the full tray and special pairs work without matching', () => {
    for (const powers of [['rainbow', 'rainbow'], ['row', 'column'], ['bomb', 'bomb']]) {
        const model = setup();
        model.board[0].special = powers[0];
        model.board[1].special = powers[1];
        const result = model.swap(0, 1);
        assert.equal(result.accepted, true);
        if (powers[0] === 'rainbow') assert.equal(result.frames.find(frame => frame.kind === 'clear').cleared.length, 56);
        assert.deepEqual(findRuns(model.board), []);
    }
});

test('gravity preserves bottom-up survivor order and fills every gap', () => {
    const model = setup();
    const column = [model.board[0], model.board[7], model.board[14], model.board[21], model.board[28], model.board[35], model.board[42], model.board[49]];
    model.board[49] = null;
    model.board[21] = null;
    model.collapse();
    assert.equal(model.board[49], column[6]);
    assert.equal(model.board[42], column[5]);
    assert.equal(model.board[35], column[4]);
    assert.equal(model.board[28], column[2]);
    assert.ok(model.board.every(Boolean));
});

test('dead-board shuffle terminates, preserves the multiset and supplies a legal move', () => {
    const model = setup();
    assert.equal(model.findMove(), null);
    const multiset = model.board.map(tile => tile.type).sort();
    model.shuffle();
    assert.ok(model.findMove());
    assert.deepEqual(findRuns(model.board), []);
    assert.deepEqual(model.board.map(tile => tile.type).sort(), multiset);
});

test('last move resolves before win/loss and completed sessions reject further input', () => {
    const win = new CoffeeCrashModel();
    win.moves = 1;
    win.level.goals.forEach(goal => win.collected[goal.type] = goal.count);
    win.swap(...win.findMove());
    assert.equal(win.status, 'won');
    assert.equal(win.stars, 1);
    assert.equal(win.swap(0, 1).accepted, false);
    const lose = new CoffeeCrashModel();
    lose.moves = 1;
    lose.level = { ...lose.level, goals: [{ type: 0, count: 10000 }] };
    lose.swap(...lose.findMove());
    assert.equal(lose.status, 'lost');
    assert.equal(lose.stars, 0);
});

test('long seeded sessions never expose empty, unstable or deadlocked playing boards', () => {
    for (const level of LEVELS) {
        const model = new CoffeeCrashModel(level.id);
        while (model.status === 'playing') {
            const before = model.snapshot();
            const pair = model.findMove();
            assert.ok(pair);
            const result = model.swap(...pair);
            assert.ok(result.accepted);
            assert.equal(model.moves, before.moves - 1);
            assert.ok(model.board.every(tile => Number.isInteger(tile.type) && tile.type >= 0 && tile.type < 5));
            assert.equal(findRuns(model.board).length, 0);
            assert.ok(result.frames.length <= 132);
        }
    }
});

test('progress validates corrupt saves, tolerates unavailable storage and keeps best records', () => {
    const memory = new Map();
    const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
    const store = new CoffeeCrashStore(storage);
    assert.equal(store.unlocked, 1);
    const model = new CoffeeCrashModel();
    model.status = 'won'; model.moves = 12; model.score = 3600;
    store.record(model);
    store.hideGuide();
    const loaded = new CoffeeCrashStore(storage);
    assert.equal(loaded.unlocked, 2);
    assert.equal(loaded.skipGuide, true);
    model.moves = 0; model.score = 1200;
    loaded.record(model);
    assert.deepEqual(loaded.records[1], { stars: 3, score: 3600 });
    assert.equal(new CoffeeCrashStore({ getItem: () => '{' }).unlocked, 1);
    assert.doesNotThrow(() => new CoffeeCrashStore({ getItem() { throw Error(); }, setItem() { throw Error(); } }).record(model));
    const invalid = new CoffeeCrashStore({ getItem: () => JSON.stringify({ version: 1, records: { 1: { stars: 9, score: -1 }, 3: { stars: 2, score: 300 } } }) });
    assert.equal(invalid.unlocked, 1);
});

test('game registers a dedicated pause context without a world joystick', () => {
    assert.equal(GAME_DEFINITIONS['coffee-crash'].inputContext, 'COFFEE_CRASH');
    assert.equal(CONTROL_LAYOUTS.COFFEE_CRASH.joystick, false);
});

test('every authored campaign level has a verified winning move sequence', async () => {
    const { default: solutions } = await import('./solutions.json', { with: { type: 'json' } });
    assert.equal(solutions.length, LEVELS.length);
    for (const solution of solutions) {
        const model = new CoffeeCrashModel(solution.level);
        for (const pair of solution.moves) assert.equal(model.swap(...pair).accepted, true);
        assert.equal(model.status, 'won', `Level ${solution.level}`);
    }
});
