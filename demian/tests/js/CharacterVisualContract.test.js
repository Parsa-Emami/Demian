import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BUILTIN_CHARACTER_SLUGS,
    CHARACTER_PACK_VERSION,
    builtinCharacterAssetPair,
    characterFrameWorldSize,
    characterPackVersion,
    characterReferenceBodyHeightRatio,
    isRemovedCombatAnimation,
    sanitizeCharacterAnimation,
} from '../../resources/js/game/characters/CharacterVisualContract.js';

test('canonical packs resolve every Demian roster member and both reference characters resolve V15', () => {
    assert.equal(CHARACTER_PACK_VERSION, 6);
    ['attack', 'combo', 'uppercut', 'cast', 'charge', 'hurt', 'hit'].forEach((name) => {
        assert.equal(isRemovedCombatAnimation(name), true);
        assert.equal(sanitizeCharacterAnimation(name), 'idle');
    });

    assert.deepEqual(BUILTIN_CHARACTER_SLUGS, ['darya', 'setayesh', 'uzudi', 'tiam', 'elaheh', 'marjan', 'mohana', 'zohre', 'kiana', 'amirreza', 'hanna', 'ainaz', 'arsal', 'sadro', 'mojtaba', 'mobina', 'negar', 'dandelox', 'iman', 'amin', 'hossein', 'taher-db', 'sorkhi', 'yalda', 'mori', 'mahyar']);
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const version = ['arsal', 'darya'].includes(slug) ? 15 : 14;
        assert.equal(characterPackVersion(slug), version);
        const pair = builtinCharacterAssetPair(slug, 'mobile', 'https://example.test/game/');
        assert.ok(pair.spriteUrl.endsWith(`${slug}-spritesheet-v${version}-mobile.png`));
        assert.ok(pair.atlasUrl.endsWith(`${slug}-atlas-v${version}-mobile.json`));
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

test('active roster art uses measured standing height for both world and side view', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const atlas = { meta: { slug, version: characterPackVersion(slug) } };
        const ratio = characterReferenceBodyHeightRatio(atlas);
        const sideRatio = characterReferenceBodyHeightRatio(atlas, { sideView: true });
        assert.ok(ratio > .65 && ratio < .78, slug);
        assert.ok(sideRatio > .65 && sideRatio < .78, slug);
        assert.ok(Math.abs(characterFrameWorldSize(atlas).frameHeight * ratio - 3.75) < 1e-9, slug);
    }
    assert.equal(characterReferenceBodyHeightRatio({
        meta: { slug: 'darya', version: 14 }, render: { referenceBodyHeightRatio: .73 },
    }), .73);
});
