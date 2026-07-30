import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG, findGameCatalogEntry } from '../../resources/js/game/catalog/GameCatalog.js';

test('Final catalog exposes every playable game from phases one through eight', () => {
    assert.deepEqual(
        GAME_CATALOG.map((game) => game.id),
        ['tetris', 'hide-and-seek', 'event', 'role-play', 'open-world']
    );
    assert.deepEqual(GAME_CATALOG.filter((game) => game.available).map((game) => game.id), ['tetris', 'hide-and-seek', 'event', 'role-play', 'open-world']);
    assert.equal(findGameCatalogEntry('open-world').status, 'available');
    assert.equal(findGameCatalogEntry('missing'), null);
});
