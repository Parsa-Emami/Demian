import test from 'node:test';
import assert from 'node:assert/strict';
import InputRepeatSystem from '../../../resources/js/game/games/tetris/systems/InputRepeatSystem.js';

test('Input repeat emits immediate movement then DAS/ARR repeats', () => {
    const repeat = new InputRepeatSystem({ das: 0.1, arr: 0.05 });
    assert.deepEqual(repeat.horizontal({ moveLeft: true }, 0.01), [-1]);
    assert.deepEqual(repeat.horizontal({ moveLeft: true }, 0.05), []);
    assert.deepEqual(repeat.horizontal({ moveLeft: true }, 0.05), [-1]);
    assert.deepEqual(repeat.horizontal({ moveLeft: true }, 0.05), [-1]);
});

test('Input repeat changes direction immediately', () => {
    const repeat = new InputRepeatSystem();
    assert.deepEqual(repeat.horizontal({ moveLeft: true }, 0.01), [-1]);
    assert.deepEqual(repeat.horizontal({ moveRight: true }, 0.01), [1]);
});
