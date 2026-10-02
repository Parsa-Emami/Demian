import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';

test('event is disabled in the mobile release', () => {
    assert.equal(GAME_DEFINITIONS['event'], undefined);
    assert.equal(GAME_CATALOG.some((g) => g.id === 'event'), false);
});
