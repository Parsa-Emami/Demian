/** Mobile-09: deterministic, bounded, portable optional offline game packages. */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';

export const OFFLINE_GAME_IDS = Object.freeze([
    'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash',
]);
export const OFFLINE_MAX_PACK_BYTES = 96 * 1024 * 1024;
const CLEAN = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/;

export function buildOfflinePackManifest({ release, entry, releaseId } = {}) {
    if (!release || !entry?.file || !/^[a-f0-9]{16}$/.test(releaseId ?? '')) {
        throw new Error('A built release and 16-character release hash are required.');
    }
    const file = path => {
        if (!CLEAN.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Unsafe PWA asset: ' + path);
        const absolute = join(release, path);
        if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error('Missing PWA asset: ' + path);
        return { path, bytes: statSync(absolute).size };
    };
    const unique = paths => [...new Set(paths)].sort().map(file);
    const buildRoot = join(release, 'build/assets');
    const buildFonts = readdirSync(buildRoot).filter(name => name.endsWith('.woff2'))
        .map(name => 'build/assets/' + name);
    const corePaths = [
        'index.html', 'characters.json', 'manifest.webmanifest',
        'build/' + entry.file,
        ...(entry.css ?? []).map(name => 'build/' + name),
        ...buildFonts,
        'assets/characters/character-manifest-v4.json',
        'assets/characters/master-motion-v1.json',
        'assets/environments/cafe-runner-v1/wordmark.png',
        'assets/environments/cafe-runner-v1/interior.webp',
        'assets/environments/demian-fbx/polished-v1/preview.webp',
    ];
    // Offline mode uses the small lite character variants for every NPC and
    // player. Never silently pull the much larger mobile/detail/desktop atlases.
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const version = characterPackVersion(slug);
        const base = 'assets/characters/' + slug + '/' + slug;
        corePaths.push(base + '-preview-v' + version + '.png');
        corePaths.push(base + '-atlas-v' + version + '-lite.json');
        corePaths.push(base + '-spritesheet-v' + version + '-lite.png');
    }
    const core = unique(corePaths);
    const artRoot = 'assets/environments/demian-fbx/polished-v1/';
    const smallTiles = [];
    const tilesRoot = join(release, artRoot + 'lod-1024');
    if (existsSync(tilesRoot)) {
        for (const name of readdirSync(tilesRoot)) {
            if (/^\d+-\d+\.webp$/.test(name)) smallTiles.push(artRoot + 'lod-1024/' + name);
        }
    }
    // Game-specific packages are small additions to a shared core. The cafe
    // preview remains playable when optional high-resolution tiles are absent.
    const extras = {
        'open-world': smallTiles,
        'dino-run': ['assets/environments/demian-fbx/floorplan.webp'],
        'after-hours': ['assets/environments/demian-fbx/floorplan-detail.webp'],
        'cafe-rush': ['assets/environments/demian-fbx/floorplan-detail.webp'],
        'cafe-critters': smallTiles,
        'coffee-crash': ['assets/environments/demian-fbx/floorplan.webp'],
    };
    const coreBytes = core.reduce((sum, asset) => sum + asset.bytes, 0);
    const games = OFFLINE_GAME_IDS.map(id => {
        const files = unique(extras[id]);
        const bytes = files.reduce((sum, asset) => sum + asset.bytes, 0);
        if (coreBytes + bytes > OFFLINE_MAX_PACK_BYTES) {
            throw new Error('Offline pack exceeds 96 MiB budget: ' + id);
        }
        return { id, bytes, totalBytes: coreBytes + bytes, files };
    });
    return {
        schema: 1, release: releaseId, maxPackBytes: OFFLINE_MAX_PACK_BYTES,
        coreBytes, core, games,
    };
}
