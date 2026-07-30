import test from 'node:test';
import assert from 'node:assert/strict';
import PieceBag from '../../../resources/js/game/games/tetris/domain/PieceBag.js';
import { PIECE_TYPES } from '../../../resources/js/game/games/tetris/domain/Tetrominoes.js';

test('Seven Bag emits each tetromino exactly once per bag', () => {
    const bag = new PieceBag({ seed: 'demian-seven-bag' });
    const first = Array.from({ length: 7 }, () => bag.next()).sort();
    const second = Array.from({ length: 7 }, () => bag.next()).sort();

    assert.deepEqual(first, [...PIECE_TYPES].sort());
    assert.deepEqual(second, [...PIECE_TYPES].sort());
});

test('Seven Bag is deterministic for the same seed', () => {
    const first = new PieceBag({ seed: 'same-seed' });
    const second = new PieceBag({ seed: 'same-seed' });
    const sequenceA = Array.from({ length: 28 }, () => first.next());
    const sequenceB = Array.from({ length: 28 }, () => second.next());

    assert.deepEqual(sequenceA, sequenceB);
});
