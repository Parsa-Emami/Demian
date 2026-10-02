import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';

test('role-play is disabled in the mobile release', () => {
    assert.equal(GAME_DEFINITIONS['role-play'], undefined);
    assert.equal(GAME_CATALOG.some((g) => g.id === 'role-play'), false);
});
