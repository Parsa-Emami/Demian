import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_DEFINITIONS } from '../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';

const root = resolve(import.meta.dirname, '../..');
const source = (file) => readFileSync(resolve(root, file), 'utf8');

test('every playable game declares the shared reference café environment', () => {
    const ids = ['tetris', 'hide-and-seek', 'event', 'role-play', 'open-world'];
    ids.forEach((id) => {
        assert.equal(GAME_DEFINITIONS[id].metadata.environment, 'demian-reference-cafe@2');
        assert.equal(GAME_CATALOG.find((game) => game.id === id)?.environment, 'demian-reference-cafe@2');
        assert.equal(GAME_DEFINITIONS[id].metadata.renderer, 'shared-canvas2d-pixel');
    });
    assert.equal(GAME_DEFINITIONS['open-world'].metadata.worldManifest, 'demian-reference-cafe@2');
});

test('every visible game renderer uses the shared 2D café pipeline and avoids Three imports', () => {
    const renderers = [
        'resources/js/game/games/tetris/render/TetrisRenderer.js',
        'resources/js/game/games/hide-and-seek/render/HideAndSeekRenderer.js',
        'resources/js/game/games/event/render/EventRenderer.js',
        'resources/js/game/games/role-play/render/RolePlayRenderer.js',
        'resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js',
    ];
    renderers.forEach((file) => {
        const contents = source(file);
        assert.match(contents, /Cafe(GameRenderer2D|PixelRenderer)/);
        assert.doesNotMatch(contents, /from ['"]three['"]/);
    });
});

test('the café pixel renderer is data-driven from the shared collision layout', () => {
    const renderer = source('resources/js/game/rendering2d/CafePixelRenderer.js');
    assert.match(renderer, /CAFE_STATIC_COLLIDERS/);
    assert.match(renderer, /drawDoorAndWindows/);
    assert.match(renderer, /drawDecor/);
    assert.match(renderer, /camera\.worldRect/);
});
