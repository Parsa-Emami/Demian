/** Mobile-02: deploy-only asset selection. Source art and validation packs stay intact. */
import { basename, relative, sep } from 'node:path';
import {
    BUILTIN_CHARACTER_SLUGS, RETIRED_CHARACTER_SLUGS, characterPackVersion,
} from '../resources/js/game/characters/CharacterVisualContract.js';
import { orderedSpriteVariants, characterRuntimeVariants } from '../resources/js/game/characters/runtime/CharacterRuntimePolicy.js';

const characters = new Set(BUILTIN_CHARACTER_SLUGS);
const retired = new Set(RETIRED_CHARACTER_SLUGS);

// Every live preferred pack and every fallback must continue to work.
// 'mobile' is also the public character JSON contract; 'desktop' is never requested
// by the live runtime (including on desktop), where high-tier uses 'detail'.
export const RELEASE_SPRITE_VARIANTS = Object.freeze(
    [...new Set([
        ...orderedSpriteVariants('detail'),
        ...orderedSpriteVariants('runtime'),
        ...orderedSpriteVariants('lite'),
        ...Object.values(characterRuntimeVariants({ tier: 'high' })),
        'mobile',
    ])].filter(variant => variant !== 'desktop'),
);

const variantSet = new Set(RELEASE_SPRITE_VARIANTS);
const packPattern = /^([a-z][a-z0-9-]*)-(spritesheet|atlas)-v(\d+)-([a-z]+)\.(png|json)$/;
const previewPattern = /^([a-z][a-z0-9-]*)-preview-v(\d+)\.png$/;

export function assetDecision(relativeAssetPath, { directory = false } = {}) {
    const path = String(relativeAssetPath).replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!path) return { keep: true, reason: 'root' };
    const segments = path.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
        return { keep: false, reason: 'unsafe-path' };
    }
    if (segments.some(segment => segment.startsWith('.'))) return { keep: false, reason: 'hidden' };
    if (segments.some(segment => /\.work\.|\.tmp$/i.test(segment))) return { keep: false, reason: 'temporary' };
    if (/^environments\/demian-fbx\/cafe\.glb$/i.test(path)) return { keep: false, reason: 'unused-raw-3d' };

    if (segments[0] !== 'characters') return { keep: true, reason: 'other-runtime-asset' };
    if (segments[1] === '_legacy_archive') return { keep: false, reason: 'legacy-archive' };
    if (retired.has(segments[1])) return { keep: false, reason: 'retired-character' };
    if (!characters.has(segments[1])) return { keep: true, reason: 'shared-character-metadata' };
    if (segments.length >= 3 && /^source-v\d+$/i.test(segments[2])) {
        return { keep: false, reason: 'character-source-art' };
    }
    if (directory) return { keep: true, reason: 'runtime-directory' };
    const filename = basename(path);
    const pack = packPattern.exec(filename);
    if (pack && pack[1] === segments[1]) {
        if ((pack[2] === 'spritesheet' && pack[5] !== 'png') ||
            (pack[2] === 'atlas' && pack[5] !== 'json')) return { keep: false, reason: 'invalid-pack-extension' };
        if (Number(pack[3]) !== characterPackVersion(segments[1])) {
            return { keep: false, reason: 'historical-pack' };
        }
        if (!variantSet.has(pack[4])) return { keep: false, reason: 'unused-pack-variant' };
        return { keep: true, reason: 'runtime-pack' };
    }
    const preview = previewPattern.exec(filename);
    if (preview && preview[1] === segments[1]) {
        return Number(preview[2]) === characterPackVersion(segments[1])
            ? { keep: true, reason: 'character-preview' }
            : { keep: false, reason: 'historical-preview' };
    }
    // Preserve independently versioned profile/ability/animation manifests, and unknown
    // metadata, rather than misclassifying assets as unused from file naming alone.
    return { keep: true, reason: 'character-metadata' };
}

export function shouldExportAsset(sourceRoot, path) {
    const relativePath = relative(sourceRoot, path).split(sep).join('/');
    if (relativePath === '..' || relativePath.startsWith('../')) {
        throw new Error('Asset copy escaped source root: ' + path);
    }
    // Called for source root, directories and leaf files by fs.cpSync.
    return assetDecision(relativePath, { directory: false }).keep;
}
