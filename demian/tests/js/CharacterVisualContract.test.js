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

test('canonical V6 fallback plus exact V9 character packs resolve every Demian roster member', () => {
    assert.equal(CHARACTER_PACK_VERSION, 6);
    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'hit'].forEach((name) => {
        assert.equal(isRemovedCombatAnimation(name), true);
        assert.equal(sanitizeCharacterAnimation(name), 'idle');
    });

    const tiam = builtinCharacterAssetPair('tiam', 'compact', 'https://example.test/game/');
    assert.match(tiam.spriteUrl, /tiam-spritesheet-v6-compact\.png$/);
    assert.match(tiam.atlasUrl, /tiam-atlas-v6-compact\.json$/);

    assert.deepEqual(BUILTIN_CHARACTER_SLUGS, [
        'tiam', 'ronak', 'amirreza', 'parsa', 'darya', 'iman', 'uzudi',
        'setayesh', 'mojtaba', 'hossein', 'arsal', 'sorkhi', 'taher-db',
    ]);

    for (const slug of ['amirreza', 'arsal', 'darya', 'hossein', 'iman', 'mojtaba', 'parsa', 'setayesh', 'sorkhi', 'taher-db', 'uzudi']) {
        assert.equal(characterPackVersion(slug), 9);
        const pair = builtinCharacterAssetPair(slug, 'mobile', 'https://example.test/game/');
        assert.match(pair.spriteUrl, new RegExp(`${slug}-spritesheet-v9-mobile\\.png$`.replace('\\\\.', '\\.')));
        assert.match(pair.atlasUrl, new RegExp(`${slug}-atlas-v9-mobile\\.json$`.replace('\\\\.', '\\.')));
    }
    assert.equal(characterPackVersion('ronak'), 6);
    assert.equal(characterPackVersion('tiam'), 6);
    assert.deepEqual(CHARACTER_PACK_VERSION_OVERRIDES, {
        amirreza: 9,
        arsal: 9,
        darya: 9,
        hossein: 9,
        iman: 9,
        mojtaba: 9,
        parsa: 9,
        setayesh: 9,
        sorkhi: 9,
        'taher-db': 9,
        uzudi: 9,
    });
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
