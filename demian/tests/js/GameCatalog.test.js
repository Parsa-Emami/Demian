import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG, findGameCatalogEntry } from '../../resources/js/game/catalog/GameCatalog.js';

const EXPECTED = [
    'neon-run', 'star-catcher', 'cafe-drift', 'shadow-maze', 'sky-hop', 'rhythm-rush',
    'tetris', 'hide-and-seek', 'event', 'role-play', 'open-world',
];

test('Final catalog exposes the core games plus the six-game Demian mini-arcade pack', () => {
    assert.deepEqual(GAME_CATALOG.map((game) => game.id), EXPECTED);
    assert.deepEqual(GAME_CATALOG.filter((game) => game.available).map((game) => game.id), EXPECTED);
    assert.equal(findGameCatalogEntry('neon-run').phase, 9);
    assert.equal(findGameCatalogEntry('open-world').status, 'available');
    assert.equal(findGameCatalogEntry('missing'), null);
});
