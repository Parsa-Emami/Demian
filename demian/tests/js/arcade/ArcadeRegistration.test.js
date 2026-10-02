import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';
import { ARCADE_CHARACTER_ROSTER } from '../../../resources/js/game/games/arcade/ArcadeCharacterRoster.js';
test('archived arcade games cannot be selected or launched', () => {
    for (const id of ['neon-run', 'star-catcher', 'cafe-drift', 'shadow-maze', 'sky-hop', 'rhythm-rush']) {
        assert.equal(GAME_DEFINITIONS[id], undefined);
        assert.equal(GAME_CATALOG.some((g) => g.id === id), false);
    }
});
test('shared character deck contains only installed art, without broken reference images', () => {
    assert.deepEqual(ARCADE_CHARACTER_ROSTER.map((c) => c.slug), ['darya', 'tiam', 'ronak']);
    assert.ok(ARCADE_CHARACTER_ROSTER.every((c) => c.referenceCard === null));
});
