import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';

 test('Event is registered as a lazy playable phase-six game', () => {
    const catalog = GAME_CATALOG.find((game) => game.id === 'event');
    assert.equal(catalog.available, true);
    assert.equal(catalog.phase, 6);
    assert.equal(GAME_DEFINITIONS.event.inputContext, 'EVENT');
    assert.equal(GAME_DEFINITIONS.event.metadata.dataDriven, true);
    assert.equal(GAME_DEFINITIONS.event.metadata.remoteDefinitionsReady, true);
    assert.ok(INPUT_CONTEXTS.EVENT.actions.eventAction);
    assert.equal(CONTROL_LAYOUTS.EVENT.id, 'event');
});
