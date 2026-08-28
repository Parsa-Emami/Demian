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

test('V6 stays canonical while only validated reference characters opt into V7', () => {
    assert.equal(CHARACTER_PACK_VERSION, 6);
    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'hit'].forEach((name) => {
        assert.equal(isRemovedCombatAnimation(name), true);
        assert.equal(sanitizeCharacterAnimation(name), 'idle');
    });

    // Characters without a supplied replacement stay on their existing V6 art.
    const tiam = builtinCharacterAssetPair('tiam', 'compact', 'https://example.test/game/');
    assert.match(tiam.spriteUrl, /tiam-spritesheet-v6-compact\.png$/);
    assert.match(tiam.atlasUrl, /tiam-atlas-v6-compact\.json$/);
    assert.equal(characterPackVersion('tiam'), 6);
    assert.equal(characterPackVersion('ronak'), 6);
    assert.equal(characterPackVersion('amirreza'), 6);
    assert.equal(characterPackVersion('parsa'), 6);
    assert.equal(characterPackVersion('iman'), 6);
    assert.equal(characterPackVersion('setayesh'), 6);
    assert.equal(characterPackVersion('uzudi'), 6);

    for (const slug of [
        'darya', 'mojtaba', 'hossein', 'arsal', 'sorkhi', 'taher-db',
    ]) {
        assert.equal(BUILTIN_CHARACTER_SLUGS.includes(slug), true);
        assert.equal(characterPackVersion(slug), 7);
    }

    assert.equal(BUILTIN_CHARACTER_SLUGS.length, 13);
    assert.deepEqual(CHARACTER_PACK_VERSION_OVERRIDES, {
        darya: 7,
        mojtaba: 7,
        hossein: 7,
        arsal: 7,
        sorkhi: 7,
        'taher-db': 7,
    });

    const darya = builtinCharacterAssetPair('darya', 'mobile', 'https://example.test/game/');
    assert.match(darya.spriteUrl, /darya-spritesheet-v7-mobile\.png$/);
    assert.match(darya.atlasUrl, /darya-atlas-v7-mobile\.json$/);

    for (const slug of ['mojtaba', 'hossein', 'arsal', 'sorkhi', 'taher-db']) {
        const pair = builtinCharacterAssetPair(slug, 'desktop', 'https://example.test/game/');
        assert.match(pair.spriteUrl, new RegExp(`${slug}-spritesheet-v7-desktop\\.png$`));
        assert.match(pair.atlasUrl, new RegExp(`${slug}-atlas-v7-desktop\\.json$`));
    }
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
