import test from 'node:test';
import assert from 'node:assert/strict';
import Board from '../../../resources/js/game/games/tetris/domain/Board.js';
import Piece from '../../../resources/js/game/games/tetris/domain/Piece.js';
import RotationSystem from '../../../resources/js/game/games/tetris/domain/RotationSystem.js';

test('SRS rotates a free T piece without a kick', () => {
    const board = new Board();
    const system = new RotationSystem();
    const piece = new Piece('T', { x: 3, y: 8 });
    const result = system.rotate(board, piece, 1);

    assert.equal(result.success, true);
    assert.equal(result.piece.rotation, 1);
    assert.equal(result.kickIndex, 0);
});

test('SRS applies an I-piece wall kick near the left wall', () => {
    const board = new Board();
    const system = new RotationSystem();
    const piece = new Piece('I', { x: -1, y: 8, rotation: 1 });

    assert.equal(board.canPlace(piece), true);
    const result = system.rotate(board, piece, 1);

    assert.equal(result.success, true);
    assert.equal(result.piece.rotation, 2);
    assert.equal(result.piece.x, 1);
    assert.equal(result.kickIndex, 2);
});

test('SRS rejects rotation when every kick position is blocked', () => {
    const board = new Board();
    const system = new RotationSystem();
    const piece = new Piece('T', { x: 3, y: 8 });
    for (let y = 6; y <= 12; y += 1) {
        for (let x = 1; x <= 7; x += 1) board.grid[y][x] = 'Z';
    }
    piece.cells().forEach(({ x, y }) => { board.grid[y][x] = null; });
    const result = system.rotate(board, piece, 1);

    assert.equal(result.success, false);
    assert.equal(result.piece, piece);
});
