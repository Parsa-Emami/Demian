import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DEFINITIONS } from '../../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../../resources/js/game/catalog/GameCatalog.js';
import { INPUT_CONTEXTS } from '../../../resources/js/game/input/InputContexts.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';
import { ARCADE_CHARACTER_ROSTER } from '../../../resources/js/game/games/arcade/ArcadeCharacterRoster.js';

const IDS = ['neon-run', 'star-catcher', 'cafe-drift', 'shadow-maze', 'sky-hop', 'rhythm-rush'];

test('six arcade mini-games are registered, playable and share one semantic input contract', () => {
    assert.equal(IDS.length, 6);
    for (const id of IDS) {
        assert.equal(typeof GAME_DEFINITIONS[id]?.loader, 'function');
        assert.equal(GAME_DEFINITIONS[id].inputContext, 'ARCADE');
        assert.equal(GAME_DEFINITIONS[id].metadata.miniGame, true);
        assert.equal(GAME_CATALOG.find((game) => game.id === id)?.available, true);
    }
    assert.ok(INPUT_CONTEXTS.ARCADE.actions.jump);
    assert.ok(INPUT_CONTEXTS.ARCADE.actions.dash);
    assert.ok(INPUT_CONTEXTS.ARCADE.actions.interact);
    assert.equal(CONTROL_LAYOUTS.ARCADE.id, 'arcade');
});

test('arcade roster exposes all built-in characters and exact V9 reference cards where supplied', () => {
    assert.equal(ARCADE_CHARACTER_ROSTER.length, 13);
    const withReferenceCards = ARCADE_CHARACTER_ROSTER.filter((entry) => entry.referenceCard);
    assert.equal(withReferenceCards.length, 11);
    assert.ok(withReferenceCards.some((entry) => entry.slug === 'mojtaba'));
    assert.ok(withReferenceCards.some((entry) => entry.slug === 'taher-db'));
});
