import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';

test('Tetris is a playable lazy game with portrait preference', () => {
    const catalog = GAME_CATALOG.find((game) => game.id === 'tetris');
    assert.equal(catalog.available, true);
    assert.equal(catalog.phase, 3);
    assert.equal(GAME_DEFINITIONS.tetris.inputContext, 'TETRIS');
    assert.equal(GAME_DEFINITIONS.tetris.orientation, 'portrait');
    assert.equal(typeof GAME_DEFINITIONS.tetris.loader, 'function');
});
