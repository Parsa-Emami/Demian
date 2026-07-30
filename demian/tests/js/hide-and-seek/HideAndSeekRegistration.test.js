import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';

test('Hide and Seek is registered as a lazy playable phase-five game', () => {
    const catalog = GAME_CATALOG.find((game) => game.id === 'hide-and-seek');
    assert.equal(catalog.available, true);
    assert.equal(catalog.phase, 5);
    assert.equal(GAME_DEFINITIONS['hide-and-seek'].inputContext, 'HIDE_AND_SEEK');
    assert.equal(GAME_DEFINITIONS['hide-and-seek'].orientation, 'landscape');
    assert.equal(GAME_DEFINITIONS['hide-and-seek'].metadata.networkReady, true);
    assert.ok(INPUT_CONTEXTS.HIDE_AND_SEEK.actions.interact);
    assert.equal(CONTROL_LAYOUTS.HIDE_AND_SEEK.id, 'hide-and-seek');
});
