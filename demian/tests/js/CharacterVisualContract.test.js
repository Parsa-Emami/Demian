import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CHARACTER_PACK_VERSION,
    BUILTIN_CHARACTER_SLUGS,
    builtinCharacterAssetPair,
    characterFrameWorldSize,
    isRemovedCombatAnimation,
    sanitizeCharacterAnimation,
} from '../../resources/js/game/characters/CharacterVisualContract.js';

test('V6 is the canonical built-in character pack and rejects combat animation names', () => {
    assert.equal(CHARACTER_PACK_VERSION, 6);
    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'hit'].forEach((name) => {
        assert.equal(isRemovedCombatAnimation(name), true);
        assert.equal(sanitizeCharacterAnimation(name), 'idle');
    });

    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('mojtaba'), true);

    const pair = builtinCharacterAssetPair('mojtaba', 'compact', 'https://example.test/game/');
    assert.match(pair.spriteUrl, /mojtaba-spritesheet-v6-compact\.png$/);
    assert.match(pair.atlasUrl, /mojtaba-atlas-v6-compact\.json$/);
});

test('canonical body footprint compensates source-art occupancy instead of scaling characters arbitrarily', () => {
    const metrics = characterFrameWorldSize({
        render: {
            referenceBodyWidthRatio: 0.5,
            referenceBodyHeightRatio: 0.75,
        },
    });

    assert.equal(metrics.bodyWidth, 2.5);
    assert.equal(metrics.bodyHeight, 3.75);
    assert.equal(metrics.frameWidth, 5);
    assert.equal(metrics.frameHeight, 5);
});
