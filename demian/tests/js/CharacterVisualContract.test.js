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

test('canonical packs resolve every Demian roster member and Darya uses the reference-driven V14 packs', () => {
    assert.equal(CHARACTER_PACK_VERSION, 6);
    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'hit'].forEach((name) => {
        assert.equal(isRemovedCombatAnimation(name), true);
        assert.equal(sanitizeCharacterAnimation(name), 'idle');
    });

    assert.deepEqual(BUILTIN_CHARACTER_SLUGS, ['darya', 'setayesh', 'uzudi', 'negar', 'tiam']);
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        assert.equal(characterPackVersion(slug), 14);
        const pair = builtinCharacterAssetPair(slug, 'mobile', 'https://example.test/game/');
        assert.ok(pair.spriteUrl.endsWith(`${slug}-spritesheet-v14-mobile.png`));
        assert.ok(pair.atlasUrl.endsWith(`${slug}-atlas-v14-mobile.json`));
    }
    assert.equal(CHARACTER_PACK_VERSION_OVERRIDES.darya, 14);

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
