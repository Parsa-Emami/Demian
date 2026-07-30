import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';

test('final Open World is registered with phase-eight capabilities', () => {
    const definition = GAME_DEFINITIONS['open-world'];
    assert.equal(definition.metadata.phase, 8);
    assert.equal(definition.metadata.chunkStreaming, true);
    assert.equal(definition.metadata.worldManifest, 'demian-city@1');
    assert.equal(GAME_CATALOG.find((game) => game.id === 'open-world').phase, 8);
    assert.ok(INPUT_CONTEXTS.OPEN_WORLD.actions.toggleMap);
    assert.ok(INPUT_CONTEXTS.OPEN_WORLD.actions.quickSave);
});
