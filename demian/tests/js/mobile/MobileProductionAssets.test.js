import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
    assetDecision, shouldExportAsset, RELEASE_SPRITE_VARIANTS,
} from '../../../tools/release_asset_policy.mjs';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../../../resources/js/game/characters/CharacterVisualContract.js';
import { orderedSpriteVariants, characterRuntimeVariants } from '../../../resources/js/game/characters/runtime/CharacterRuntimePolicy.js';

describe('Mobile-02 production asset selection', () => {
    it('preserves every real preferred and fallback sprite variant for all installed characters', () => {
        const requested = new Set([
            ...orderedSpriteVariants('detail'), ...orderedSpriteVariants('runtime'), ...orderedSpriteVariants('lite'),
            ...Object.values(characterRuntimeVariants({ tier: 'high' })),
            ...Object.values(characterRuntimeVariants({ tier: 'balanced' })),
            ...Object.values(characterRuntimeVariants({ tier: 'performance' })),
            'mobile',
        ]);
        for (const variant of requested) {
            assert.ok(RELEASE_SPRITE_VARIANTS.includes(variant), 'missing runtime fallback ' + variant);
        }
        assert.equal(RELEASE_SPRITE_VARIANTS.includes('desktop'), false);
        for (const slug of BUILTIN_CHARACTER_SLUGS) {
            const version = characterPackVersion(slug);
            for (const variant of RELEASE_SPRITE_VARIANTS) {
                const path = 'characters/' + slug + '/';
                assert.equal(assetDecision(path + slug + '-atlas-v' + version + '-' + variant + '.json').keep, true);
                assert.equal(assetDecision(path + slug + '-spritesheet-v' + version + '-' + variant + '.png').keep, true);
            }
            assert.equal(assetDecision('characters/' + slug + '/' + slug + '-preview-v' + version + '.png').keep, true);
        }
    });

    it('excludes historical, unused desktop and authoring sources without deleting live manifests', () => {
        const excluded = [
            'characters/darya/source-v14/master.png',
            'characters/darya/source-v12/master.png',
            'characters/darya/darya-spritesheet-v12-desktop.png',
            'characters/darya/darya-atlas-v13-mobile.json',
            'characters/darya/darya-spritesheet-v14-desktop.png',
            'characters/ronak/ronak-spritesheet-v14-runtime.png',
            'characters/_legacy_archive/parsa/data.json',
            'environments/demian-fbx/cafe.glb',
            'characters/negar/.private.png',
            'characters/negar/file.tmp',
        ];
        for (const path of excluded) assert.equal(assetDecision(path).keep, false, 'must prune ' + path);
        assert.equal(assetDecision('characters/darya/manifests/character_manifest_v4.json').keep, true);
        assert.equal(assetDecision('characters/darya/darya-character.json').keep, true);
        assert.equal(assetDecision('characters/character-manifest-v4.json').keep, true);
        assert.equal(assetDecision('characters/master-motion-v1.json').keep, true);
        assert.equal(assetDecision('environments/demian-fbx/polished-v1/lod-1536/0-0.webp').keep, true);
        assert.equal(assetDecision('reference/cafe/reference.png').keep, true);
    });

    it('rejects path traversal and never exports outside the source root', () => {
        assert.equal(assetDecision('characters/../secrets.txt').keep, false);
        assert.equal(assetDecision('characters/./secrets.txt').keep, false);
        const source = resolve('/tmp/demian/assets');
        assert.throws(() => shouldExportAsset(source, resolve('/tmp/private.txt')), /escaped source root/);
        assert.equal(shouldExportAsset(source, source), true);
    });
});
