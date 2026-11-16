/** Mobile-09: deterministic, bounded, portable optional offline game packages. */
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';

export const OFFLINE_GAME_IDS = Object.freeze([
    'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash',
]);
export const OFFLINE_MAX_PACK_BYTES = 96 * 1024 * 1024;
const CLEAN = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/;

const GAME_STYLES = Object.freeze({
    'dino-run': 'resources/css/phase5-step23-dino-run.css',
    'after-hours': 'resources/css/after-hours.css',
    'cafe-rush': 'resources/css/cafe-rush.css',
    'cafe-critters': 'resources/css/cafe-critters.css',
    'coffee-crash': 'resources/css/coffee-crash.css',
});

const GAME_MODULES = Object.freeze({
    'open-world': 'resources/js/game/games/open-world/OpenWorldGame.js',
    'dino-run': 'resources/js/game/games/dino-run/DinoRunGame.js',
    'after-hours': 'resources/js/game/games/after-hours/AfterHoursGame.js',
    'cafe-rush': 'resources/js/game/games/cafe-rush/CafeRushGame.js',
    'cafe-critters': 'resources/js/game/games/cafe-critters/CafeCrittersGame.js',
    'coffee-crash': 'resources/js/game/games/coffee-crash/CoffeeCrashGame.js',
});

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
    // Each optional PWA game needs its own lazy module, transitively imported
    // shared JS/CSS/assets, and scene artwork. Keep five unselected games out
    // of the core offline package.
    const vite = JSON.parse(readFileSync(join(release, 'build/manifest.json'), 'utf8'));
    const buildDependencies = (key, visited = new Set()) => {
        if (visited.has(key)) return [];
        const record = vite[key];
        if (!record?.file) throw new Error('Missing Vite module: ' + key);
        visited.add(key);
        return [
            'build/' + record.file,
            ...(record.css ?? []).map(path => 'build/' + path),
            ...(record.assets ?? []).map(path => 'build/' + path),
            ...(record.imports ?? []).flatMap(child => buildDependencies(child, visited)),
        ];
    };
    const eagerBuildAssets = new Set(buildDependencies('resources/js/app.js'));
    // The deferred PWA UI must be in the offline core, even when its module
    // is no longer on the initial menu's critical network/parse path.
    const controller = 'resources/js/game/performance/PwaUpdateController.js';
    if (!vite[controller]?.isDynamicEntry) {
        throw new Error('Deferred PWA controller was not emitted as a dynamic module.');
    }
    for (const path of buildDependencies(controller)) eagerBuildAssets.add(path);
    for (const [id, source] of Object.entries(GAME_MODULES)) {
        if (!vite[source]?.isDynamicEntry ||
            eagerBuildAssets.has('build/' + vite[source].file)) {
            throw new Error('Offline game missing independently deployable chunk: ' + id);
        }
    }
    const buildRoot = join(release, 'build/assets');
    const buildFonts = readdirSync(buildRoot).filter(name => name.endsWith('.woff2'))
        .map(name => 'build/assets/' + name);
    const corePaths = [
        'index.html', 'characters.json', 'manifest.webmanifest',
        'privacy/index.html', 'terms/index.html', 'competition-rules/index.html',
        ...eagerBuildAssets,
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
    };
    const coreBytes = core.reduce((sum, asset) => sum + asset.bytes, 0);
    const games = OFFLINE_GAME_IDS.map(id => {
        const files = unique([
            ...extras[id],
            ...buildDependencies(GAME_MODULES[id]).filter(path => !eagerBuildAssets.has(path)),
            ...(GAME_STYLES[id] ? buildDependencies(GAME_STYLES[id]).filter(path => !eagerBuildAssets.has(path)) : []),
        ]);
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
