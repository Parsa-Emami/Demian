import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_CONTEXTS } from '../../resources/js/game/input/InputContexts.js';

test('Open World and Tetris map Space to different semantic actions', () => {
    assert.ok(INPUT_CONTEXTS.OPEN_WORLD.actions.jump.keys.includes('space'));
    assert.ok(INPUT_CONTEXTS.TETRIS.actions.hardDrop.keys.includes('space'));
    assert.equal(INPUT_CONTEXTS.OPEN_WORLD.actions.jump.mode, 'press');
    assert.equal(INPUT_CONTEXTS.TETRIS.actions.hardDrop.mode, 'press');
});

test('Open World exposes non-combat character actions and no hit controls', () => {
    const requiredActions = ['run', 'jump', 'slide', 'celebrate', 'wave', 'speak', 'interact'];

    requiredActions.forEach((action) => {
        assert.ok(INPUT_CONTEXTS.OPEN_WORLD.actions[action], `${action} is missing`);
    });

    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'guitar', 'spin', 'dance', 'taunt', 'sleep', 'pose', 'laugh', 'salute', 'dodge'].forEach((action) => {
        assert.equal(INPUT_CONTEXTS.OPEN_WORLD.actions[action], undefined, `${action} must stay removed`);
    });
});
