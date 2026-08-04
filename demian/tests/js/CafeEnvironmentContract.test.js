import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_DEFINITIONS } from '../../resources/js/game/registry/GameDefinitions.js';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';
import manifest from '../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';
import legacyManifest from '../../resources/js/game/games/open-world/data/DemianCityManifest.js';
import {
    assertCafeGameDefinition,
    assertCafeWorldManifest,
    CAFE_ENVIRONMENT_ID,
    CAFE_REFERENCE_ASSET_ROOT,
} from '../../resources/js/game/shared/cafe/CafeEnvironmentContract.js';

test('every registered game is hard-locked to the shared reference café', () => {
    for (const [gameId, definition] of Object.entries(GAME_DEFINITIONS)) {
        assert.equal(assertCafeGameDefinition(gameId, definition), true);
        assert.equal(definition.metadata.environment, CAFE_ENVIRONMENT_ID);
        assert.equal(definition.metadata.environmentLocked, true);
        assert.equal(definition.metadata.referenceAssets, CAFE_REFERENCE_ASSET_ROOT);
    }

    for (const entry of GAME_CATALOG) {
        assert.equal(entry.environment, CAFE_ENVIRONMENT_ID);
        assert.equal(entry.environmentLocked, true);
        assert.equal(entry.referenceAssets, CAFE_REFERENCE_ASSET_ROOT);
    }
});

test('current and legacy Open World imports resolve to the same café manifest', () => {
    assert.equal(assertCafeWorldManifest(manifest), true);
    assert.equal(legacyManifest, manifest);
    assert.equal(JSON.stringify(manifest.serialize()).toLowerCase().includes('neon'), false);
});
