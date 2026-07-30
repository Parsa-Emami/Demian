import test from 'node:test';
import assert from 'node:assert/strict';
import Board from '../../../resources/js/game/games/tetris/domain/Board.js';
import Piece from '../../../resources/js/game/games/tetris/domain/Piece.js';

test('Tetris Board locks pieces and clears completed rows', () => {
    const board = new Board({ width: 10, visibleRows: 20, hiddenRows: 4 });
    for (let x = 0; x < 6; x += 1) board.grid[23][x] = 'J';
    const piece = new Piece('I', { x: 6, y: 22, rotation: 0 });

    assert.equal(board.canPlace(piece), true);
    assert.equal(board.lockPiece(piece), true);
    assert.deepEqual(board.completedRows(), [23]);
    assert.deepEqual(board.clearCompletedLines(), [23]);
    assert.ok(board.grid[0].every((cell) => cell === null));
});

test('Tetris Board computes ghost landing without mutating piece', () => {
    const board = new Board();
    const piece = new Piece('T', { x: 3, y: 2 });
    const landingY = board.ghostY(piece);

    assert.equal(piece.y, 2);
    assert.ok(landingY > piece.y);
    assert.equal(board.canPlace(piece.clone({ y: landingY })), true);
    assert.equal(board.canPlace(piece.clone({ y: landingY + 1 })), false);
});

test('Tetris Board treats walls and floor as occupied', () => {
    const board = new Board();
    assert.equal(board.occupied(-1, 5), true);
    assert.equal(board.occupied(10, 5), true);
    assert.equal(board.occupied(0, 24), true);
    assert.equal(board.occupied(0, -1), false);
});
