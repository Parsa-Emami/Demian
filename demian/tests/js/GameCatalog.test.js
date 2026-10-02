import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG, findGameCatalogEntry } from '../../resources/js/game/catalog/GameCatalog.js';

const EXPECTED = ['open-world', 'dino-run'];

test('Mobile release exposes only Open World and Dino Run', () => {
    assert.deepEqual(GAME_CATALOG.map((game) => game.id), EXPECTED);
    assert.deepEqual(GAME_CATALOG.filter((game) => game.available).map((game) => game.id), EXPECTED);
    assert.equal(findGameCatalogEntry('dino-run').phase, 12);
    assert.equal(findGameCatalogEntry('open-world').status, 'available');
    assert.equal(findGameCatalogEntry('missing'), null);
});
