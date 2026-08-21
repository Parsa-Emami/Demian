import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BUILTIN_CHARACTER_SLUGS,
    CHARACTER_PACK_VERSION,
    CHARACTER_PACK_VERSION_OVERRIDES,
    builtinCharacterAssetPair,
    characterFrameWorldSize,
    characterPackVersion,
    isRemovedCombatAnimation,
    sanitizeCharacterAnimation,
} from '../../resources/js/game/characters/CharacterVisualContract.js';

test('V6 is the canonical built-in character pack and rejects combat animation names', () => {
    assert.equal(CHARACTER_PACK_VERSION, 6);
    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'hit'].forEach((name) => {
        assert.equal(isRemovedCombatAnimation(name), true);
        assert.equal(sanitizeCharacterAnimation(name), 'idle');
    });

    const pair = builtinCharacterAssetPair('tiam', 'compact', 'https://example.test/game/');
    assert.match(pair.spriteUrl, /tiam-spritesheet-v6-compact\.png$/);
    assert.match(pair.atlasUrl, /tiam-atlas-v6-compact\.json$/);

    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('darya'), true);
    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('iman'), true);
    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('setayesh'), true);
    assert.equal(BUILTIN_CHARACTER_SLUGS.length, 8);

    // Darya has an HD (v7) pack; every other built-in character stays on the
    // canonical v6 pack until its own HD pack is generated and validated.
    assert.equal(characterPackVersion('darya'), 7);
    assert.equal(characterPackVersion('tiam'), 6);
    assert.equal(characterPackVersion('iman'), 6);
    assert.equal(characterPackVersion('setayesh'), 6);
    assert.deepEqual(CHARACTER_PACK_VERSION_OVERRIDES, { darya: 7 });

    const darya = builtinCharacterAssetPair('darya', 'mobile', 'https://example.test/game/');
    assert.match(darya.spriteUrl, /darya-spritesheet-v7-mobile\.png$/);
    assert.match(darya.atlasUrl, /darya-atlas-v7-mobile\.json$/);
    const iman = builtinCharacterAssetPair('iman', 'desktop', 'https://example.test/game/');
    assert.match(iman.spriteUrl, /iman-spritesheet-v6-desktop\.png$/);
    assert.match(iman.atlasUrl, /iman-atlas-v6-desktop\.json$/);
    const setayesh = builtinCharacterAssetPair('setayesh', 'mobile', 'https://example.test/game/');
    assert.match(setayesh.spriteUrl, /setayesh-spritesheet-v6-mobile\.png$/);
    assert.match(setayesh.atlasUrl, /setayesh-atlas-v6-mobile\.json$/);
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
