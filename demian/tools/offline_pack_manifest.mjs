/** Mobile-09: deterministic, bounded, portable optional offline game packages. */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';

export const OFFLINE_GAME_IDS = Object.freeze([
    'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash', 'cafe-drift',
]);
export const OFFLINE_MAX_PACK_BYTES = 96 * 1024 * 1024;
// Hash only executable/config text under 2 MiB. Never duplicate-decode or
// hash large textures in a mobile Service Worker during an offline install.
export const OFFLINE_HASH_MAX_BYTES = 2 * 1024 * 1024;
const CLEAN = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/;


const GAME_MODULES = Object.freeze({
    'open-world': 'open-world/OpenWorldGame.js',
    'dino-run': 'dino-run/DinoRunGame.js',
    'after-hours': 'after-hours/AfterHoursGame.js',
    'cafe-rush': 'cafe-rush/CafeRushGame.js',
    'cafe-critters': 'cafe-critters/CafeCrittersGame.js',
    'coffee-crash': 'coffee-crash/CoffeeCrashGame.js',
    'cafe-drift': 'cafe-drift/CafeDriftGame.js',
});

// A selected game's styles belong to its optional offline package, not to the
// eager shell/core. Café games also need After Hours shift-dialog controls.
const GAME_STYLES = Object.freeze({
    'open-world': [],
    'dino-run': ['resources/css/phase5-step23-dino-run.css'],
    'after-hours': ['resources/css/after-hours.css'],
    'cafe-rush': ['resources/css/after-hours.css', 'resources/css/cafe-rush.css'],
    'cafe-critters': ['resources/css/after-hours.css', 'resources/css/cafe-critters.css'],
    'coffee-crash': ['resources/css/coffee-crash.css'],
    'cafe-drift': [], // Already statically owned by the lazy CafeDriftGame chunk.
});

export function splitOfflineModules(viteManifest = {}) {
    const core = new Set();
    const games = Object.fromEntries(OFFLINE_GAME_IDS.map(id => [id, new Set()]));
    const entryKey = 'resources/js/app.js';
    const entry = viteManifest[entryKey];
    if (!entry) return { core: [], games: Object.fromEntries(
        OFFLINE_GAME_IDS.map(id => [id, []])) };
    const gameKeys = new Set(Object.values(GAME_MODULES).map(path =>
        'resources/js/game/games/' + path));
    const gameStyleKeys = new Set(Object.values(GAME_STYLES).flat());
    const follow = (key, into, includeDynamic, seen = new Set()) => {
        if (seen.has(key)) return;
        seen.add(key);
        const row = viteManifest[key];
        if (!row?.file) throw new Error('Missing split offline dependency: ' + key);
        into.add('build/' + row.file);
        for (const path of [...(row.css ?? []), ...(row.assets ?? [])]) into.add('build/' + path);
        for (const child of row.imports ?? []) follow(child, into, includeDynamic, seen);
        // Built game chunks sometimes have a static import edge back to app.js.
        // Do not traverse app's dynamic menu: that would download EVERY game
        // whenever one selected game is saved for offline use.
        if (includeDynamic && key !== entryKey) {
            for (const child of row.dynamicImports ?? []) {
                if (child !== key && !gameKeys.has(child) && !gameStyleKeys.has(child)) {
                    follow(child, into, true, seen);
                }
            }
        }
    };
    follow(entryKey, core, false);
    for (const dynamic of entry.dynamicImports ?? []) {
        if (dynamic !== entryKey && !gameKeys.has(dynamic) && !gameStyleKeys.has(dynamic)) {
            follow(dynamic, core, true);
        }
    }
    for (const [id, module] of Object.entries(GAME_MODULES)) {
        const key = 'resources/js/game/games/' + module;
        if (!viteManifest[key]) throw new Error('Missing offline game chunk: ' + key);
        follow(key, games[id], true);
        // Traverse style dependencies only for this game. The build validator
        // separately enforces that every requested style exists in the release.
        for (const style of GAME_STYLES[id] ?? []) {
            if (viteManifest[style]) follow(style, games[id], true);
        }
        for (const path of core) games[id].delete(path);
    }
    return { core: [...core], games: Object.fromEntries(
        OFFLINE_GAME_IDS.map(id => [id, [...games[id]]])) };
}

export function buildOfflinePackManifest({ release, entry, releaseId, viteManifest = null } = {}) {
    if (!release || !entry?.file || !/^[a-f0-9]{16}$/.test(releaseId ?? '')) {
        throw new Error('A built release and 16-character release hash are required.');
    }
    const file = path => {
        if (!CLEAN.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Unsafe PWA asset: ' + path);
        const absolute = join(release, path);
        if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error('Missing PWA asset: ' + path);
        const bytes = statSync(absolute).size;
        const mustHash = /\.(?:js|css|json|html|webmanifest)$/.test(path)
            && bytes <= OFFLINE_HASH_MAX_BYTES;
        return {
            path, bytes,
            ...(mustHash ? { sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') } : {}),
        };
    };
    const unique = paths => [...new Set(paths)].sort().map(file);
    const buildRoot = join(release, 'build/assets');
    const buildFonts = readdirSync(buildRoot).filter(name => name.endsWith('.woff2'))
        .map(name => 'build/assets/' + name);
    const manifestFile = join(release, 'build/manifest.json');
    const chunks = splitOfflineModules(viteManifest ?? (existsSync(manifestFile)
        ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {}));
    const corePaths = [
        ...chunks.core,
        'index.html', 'characters.json', 'manifest.webmanifest',
        'favicon.ico', 'icons/demian-192.png', 'icons/demian-512.png',
        'icons/demian-notification-badge.png', 'icons/demian-notification.png',
        'privacy/index.html', 'terms/index.html', 'competition-rules/index.html',
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
        // The release-only lossless encoder may replace the lite PNG with an
        // identical RGBA WebP. The offline core must reference the file that
        // actually ships and must not accidentally cache duplicate formats.
        const png = base + '-spritesheet-v' + version + '-lite.png';
        const webp = base + '-spritesheet-v' + version + '-lite.webp';
        const hasPng = existsSync(join(release, png));
        const hasWebp = existsSync(join(release, webp));
        if (hasPng === hasWebp) throw new Error('Missing or ambiguous offline lite atlas: ' + slug);
        corePaths.push(hasWebp ? webp : png);
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
        'cafe-drift': [],
    };
    const coreBytes = core.reduce((sum, asset) => sum + asset.bytes, 0);
    const games = OFFLINE_GAME_IDS.map(id => {
        const files = unique([...extras[id], ...chunks.games[id]]);
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
