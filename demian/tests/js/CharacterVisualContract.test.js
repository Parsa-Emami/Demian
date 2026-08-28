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
    assert.match(pair.spriteUrl, /tiam-spritesheet-v7-compact\.png$/);
    assert.match(pair.atlasUrl, /tiam-atlas-v7-compact\.json$/);

    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('darya'), true);
    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('iman'), true);
    assert.equal(BUILTIN_CHARACTER_SLUGS.includes('setayesh'), true);
    assert.equal(BUILTIN_CHARACTER_SLUGS.length, 8);

    // Every built-in character now ships an HD (v7) pack (edge-aware upscale +
    // polish pass over its validated v6 art, same poses/animations, no new
    // content invented) so nobody is behind Ronak's/Darya's pixel density.
    assert.equal(characterPackVersion('darya'), 7);
    assert.equal(characterPackVersion('tiam'), 7);
    assert.equal(characterPackVersion('iman'), 7);
    assert.equal(characterPackVersion('setayesh'), 7);
    assert.equal(characterPackVersion('ronak'), 7);
    assert.equal(characterPackVersion('amirreza'), 7);
    assert.equal(characterPackVersion('parsa'), 7);
    assert.equal(characterPackVersion('mojtaba'), 7);
    assert.equal(characterPackVersion('uzudi'), 7);
    assert.deepEqual(CHARACTER_PACK_VERSION_OVERRIDES, {
        amirreza: 7,
        darya: 7,
        iman: 7,
        mojtaba: 7,
        parsa: 7,
        ronak: 7,
        setayesh: 7,
        tiam: 7,
        uzudi: 7,
    });

    const darya = builtinCharacterAssetPair('darya', 'mobile', 'https://example.test/game/');
    assert.match(darya.spriteUrl, /darya-spritesheet-v7-mobile\.png$/);
    assert.match(darya.atlasUrl, /darya-atlas-v7-mobile\.json$/);
    const iman = builtinCharacterAssetPair('iman', 'desktop', 'https://example.test/game/');
    assert.match(iman.spriteUrl, /iman-spritesheet-v7-desktop\.png$/);
    assert.match(iman.atlasUrl, /iman-atlas-v7-desktop\.json$/);
    const setayesh = builtinCharacterAssetPair('setayesh', 'mobile', 'https://example.test/game/');
    assert.match(setayesh.spriteUrl, /setayesh-spritesheet-v7-mobile\.png$/);
    assert.match(setayesh.atlasUrl, /setayesh-atlas-v7-mobile\.json$/);
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
