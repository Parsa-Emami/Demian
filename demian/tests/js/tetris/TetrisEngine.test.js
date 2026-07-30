import test from 'node:test';
import assert from 'node:assert/strict';
import Piece from '../../../resources/js/game/games/tetris/domain/Piece.js';
import TetrisEngine from '../../../resources/js/game/games/tetris/systems/TetrisEngine.js';

test('Tetris engine starts deterministic sessions with queue, hold and ghost', () => {
    const first = new TetrisEngine();
    const second = new TetrisEngine();
    const snapshotA = first.start({ seed: 'engine-seed' });
    const snapshotB = second.start({ seed: 'engine-seed' });

    assert.equal(snapshotA.activePiece.type, snapshotB.activePiece.type);
    assert.deepEqual(snapshotA.nextQueue, snapshotB.nextQueue);
    assert.ok(snapshotA.ghostPiece.y >= snapshotA.activePiece.y);
    assert.equal(snapshotA.holdAvailable, true);
});

test('Tetris engine permits one hold per active piece', () => {
    const engine = new TetrisEngine();
    engine.start({ seed: 'hold-seed' });
    const firstType = engine.activePiece.type;

    assert.equal(engine.hold(), true);
    assert.equal(engine.heldPiece, firstType);
    assert.equal(engine.hold(), false);
});

test('Tetris engine hard drop clears lines and scores', () => {
    const events = [];
    const engine = new TetrisEngine({ onEvent: (event) => events.push(event) });
    engine.start({ seed: 'line-seed' });
    for (let x = 0; x < 6; x += 1) engine.board.grid[23][x] = 'J';
    engine.activePiece = new Piece('I', { x: 6, y: 21, rotation: 0 });

    engine.update(1 / 60, { hardDrop: true });

    assert.equal(engine.scoring.lines, 1);
    assert.ok(engine.scoring.score >= 100);
    assert.ok(events.some((event) => event.type === 'lines-cleared'));
});

test('Tetris engine exports a deterministic replay for live sessions', () => {
    const engine = new TetrisEngine();
    engine.start({ seed: 'record-seed' });
    engine.update(1 / 60, { moveLeft: true });
    engine.update(1 / 60, { hardDrop: true });
    const result = engine.result('test');

    assert.equal(result.replay.seed, 'record-seed');
    assert.ok(result.replay.events.length >= 2);
});

test('Tetris replay reproduces the same deterministic engine state', () => {
    const live = new TetrisEngine();
    live.start({ seed: 'deterministic-replay' });

    for (let tick = 0; tick < 120; tick += 1) {
        const input = {};
        if (tick < 8) input.moveLeft = true;
        if (tick === 12) input.rotateClockwise = true;
        if (tick === 30 || tick === 70 || tick === 110) input.hardDrop = true;
        if (tick >= 45 && tick < 55) input.moveRight = true;
        live.update(1 / 60, input);
    }

    const replay = live.result('snapshot').replay;
    const playback = new TetrisEngine();
    playback.start({ replay });
    for (let tick = 0; tick < 120; tick += 1) {
        playback.update(1 / 60, {});
    }

    const liveSnapshot = live.snapshot();
    const replaySnapshot = playback.snapshot();
    assert.deepEqual(replaySnapshot.board, liveSnapshot.board);
    assert.deepEqual(replaySnapshot.activePiece, liveSnapshot.activePiece);
    assert.deepEqual(replaySnapshot.nextQueue, liveSnapshot.nextQueue);
    assert.deepEqual(replaySnapshot.scoring, liveSnapshot.scoring);
});

test('Tetris lock delay waits before locking a grounded piece', () => {
    const engine = new TetrisEngine();
    engine.start({ seed: 'lock-delay' });
    engine.activePiece = new Piece('O', { x: 3, y: 22 });

    engine.update(0.49, {});
    assert.equal(engine.piecesLocked, 0);
    engine.update(0.02, {});
    assert.equal(engine.piecesLocked, 1);
});

test('Tetris engine rejects replays recorded at a different fixed step', () => {
    const engine = new TetrisEngine();
    assert.throws(() => engine.start({
        replay: { version: 1, seed: 'bad-step', fixedStep: 1 / 30, events: [] },
    }), /fixed-step/);
});

test('Tetris engine rejects replays without a finite matching fixed-step', () => {
    const engine = new TetrisEngine();
    const baseReplay = {
        version: 1,
        seed: 'replay-step-validation',
        events: [{ tick: 0, input: {} }],
    };

    assert.throws(() => engine.start({ replay: baseReplay }), /fixed-step/);
    assert.throws(() => engine.start({
        replay: { ...baseReplay, fixedStep: Number.NaN },
    }), /fixed-step/);
    assert.throws(() => engine.start({
        replay: { ...baseReplay, fixedStep: 1 / 30 },
    }), /fixed-step/);
});

