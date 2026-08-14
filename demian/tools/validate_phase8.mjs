import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { testRunnerCoversGroup } from './validation/testRunnerContract.mjs';
import { walk, lintPhpFiles } from './validation/projectWalk.mjs';
import manifest, { DEMIAN_CITY_MANIFEST_DEFINITION } from '../resources/js/game/games/open-world/data/DemianCityManifest.js';
import { validateWorldManifest } from '../resources/js/game/games/open-world/world/WorldManifest.js';
import WorldPartition from '../resources/js/game/games/open-world/world/WorldPartition.js';

const root = resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const jsFiles = [
    ...walk(join(root, 'resources/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tests/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tools'), (file) => extname(file) === '.mjs'),
];
for (const file of jsFiles) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(check.status === 0, `Syntax error: ${file}\n${check.stderr}`);
    const source = readFileSync(file, 'utf8');
    const imports = file.includes(`${join('tools', '')}`) ? [] : [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g), ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((match) => match[1])
        .filter((specifier) => specifier.startsWith('.'));
    for (const specifier of imports) {
        const base = resolve(dirname(file), specifier);
        assert([base, `${base}.js`, `${base}.mjs`, `${base}.json`, join(base, 'index.js')].some(existsSync), `Unresolved import ${specifier} in ${file}`);
    }
}

const required = [
    'resources/js/game/games/open-world/OpenWorldGame.js',
    'resources/js/game/games/open-world/data/DemianCityManifest.js',
    'resources/js/game/games/open-world/world/WorldManifest.js',
    'resources/js/game/games/open-world/world/WorldPartition.js',
    'resources/js/game/games/open-world/world/WorldDiscovery.js',
    'resources/js/game/games/open-world/world/EnvironmentSystem.js',
    'resources/js/game/games/open-world/streaming/ChunkManager.js',
    'resources/js/game/games/open-world/streaming/ChunkLoader.js',
    'resources/js/game/games/open-world/streaming/ChunkUnloader.js',
    'resources/js/game/games/open-world/render/OpenWorldChunkRenderer.js',
    'resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js',
    'resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js',
    'resources/js/game/rendering2d/PixelCamera2D.js',
    'resources/js/game/rendering2d/CafePixelRenderer.js',
    'resources/js/game/games/open-world/entities/AiBudgetScheduler.js',
    'resources/js/game/games/open-world/persistence/OpenWorldSaveStore.js',
    'resources/js/game/games/open-world/persistence/SavePointSystem.js',
    'resources/js/game/games/open-world/ui/MiniMap.js',
    'resources/js/game/games/open-world/ui/WorldMap.js',
    'resources/js/game/games/open-world/ui/OpenWorldHud.js',
    'docs/PHASE-8-OPEN-WORLD.fa.md',
];
required.forEach((file) => assert(existsSync(join(root, file)), `Missing ${file}`));

const manifestErrors = validateWorldManifest(DEMIAN_CITY_MANIFEST_DEFINITION);
assert(manifestErrors.length === 0, `Invalid bundled world manifest: ${manifestErrors.join('; ')}`);
assert(manifest.chunks.length === 12, `Expected 12 café chunks, got ${manifest.chunks.length}.`);
assert(manifest.districts.length === 4, `Expected 4 café districts, got ${manifest.districts.length}.`);
assert(manifest.savePoints.length === 4, `Expected 4 save points, got ${manifest.savePoints.length}.`);
const partition = new WorldPartition(manifest);
for (const point of manifest.savePoints) {
    assert(partition.chunkAt(point.position)?.id === point.chunkId, `Save point ${point.id} is outside its declared chunk.`);
}
assert(partition.chunkAt(manifest.spawn) !== null, 'World spawn is outside the manifest.');

const domainFiles = [
    'world/WorldManifest.js', 'world/WorldPartition.js', 'world/WorldDiscovery.js',
    'streaming/ChunkManager.js', 'streaming/ChunkLoader.js', 'streaming/ChunkUnloader.js',
    'entities/AiBudgetScheduler.js', 'persistence/OpenWorldSaveStore.js', 'persistence/SavePointSystem.js',
].map((file) => join(root, 'resources/js/game/games/open-world', file));
for (const file of domainFiles) {
    const source = readFileSync(file, 'utf8');
    assert(!source.includes("from 'three'"), `Open World domain imports Three.js: ${file}`);
    assert(!/\b(document|window|HTMLElement|HTMLCanvasElement)\b/.test(source), `Open World domain depends on DOM: ${file}`);
    assert(!/\b(TODO|FIXME|debugger|console\.log)\b/.test(source), `Debug marker found: ${file}`);
}

const game = readFileSync(join(root, 'resources/js/game/games/open-world/OpenWorldGame.js'), 'utf8');
for (const marker of [
    'new WorldPartition', 'new ChunkManager', 'new ChunkLoader', 'new ChunkUnloader',
    'new AiBudgetScheduler', 'new WorldDiscovery', 'new OpenWorldSaveStore', 'new SavePointSystem',
    'new OpenWorldHud', 'ensureAround', 'fastTravel', 'buildSaveState', 'restoreSession',
    "createScope('open-world')", 'streamingMode: true',
]) assert(game.includes(marker), `OpenWorldGame integration missing: ${marker}`);

const renderer = readFileSync(join(root, 'resources/js/game/games/open-world/render/OpenWorldChunkRenderer.js'), 'utf8');
for (const marker of ['Data-only chunk factory', 'setTier', 'dispose', 'handles']) {
    assert(renderer.includes(marker), `Chunk renderer lifecycle missing: ${marker}`);
}
assert(!renderer.includes("from 'three'"), 'Chunk renderer must not import Three.js.');
const pixelRenderer = readFileSync(join(root, 'resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js'), 'utf8');
for (const marker of ['PixelCamera2D', 'CafePixelRenderer', 'drawSpriteCharacter', 'context.renderer.present']) {
    assert(pixelRenderer.includes(marker), `Pixel Open World renderer missing: ${marker}`);
}
const manager = readFileSync(join(root, 'resources/js/game/games/open-world/streaming/ChunkManager.js'), 'utf8');
for (const marker of ['AbortController', 'maxLoadedChunks', 'concurrency', 'activeRadius', 'preloadRadius', 'enforceBudget', 'whenIdle']) {
    assert(manager.includes(marker), `ChunkManager capability missing: ${marker}`);
}

const definitions = readFileSync(join(root, 'resources/js/game/registry/GameDefinitions.js'), 'utf8');
for (const marker of ['phase: 8', 'chunkStreaming: true', "worldManifest: CAFE_ENVIRONMENT_ID", 'miniMap: true', 'worldMap: true', 'aiBudgeting: true', 'persistentSavePoints: true']) {
    assert(definitions.includes(marker), `Open World definition missing: ${marker}`);
}
const input = readFileSync(join(root, 'resources/js/game/input/InputContexts.js'), 'utf8');
for (const marker of ['toggleMap', 'quickSave']) assert(input.includes(marker), `Open World input missing: ${marker}`);
const css = readFileSync(join(root, 'resources/css/app.css'), 'utf8');
for (const marker of ['.open-world-minimap', '.open-world-map', '.open-world-streaming-hud']) assert(css.includes(marker), `Open World CSS missing: ${marker}`);
const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert((strippedCss.match(/{/g) ?? []).length === (strippedCss.match(/}/g) ?? []).length, 'CSS braces are unbalanced.');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert(packageJson.scripts?.['validate:phase8'] === 'node tools/validate_phase8.mjs', 'validate:phase8 script missing.');
assert(testRunnerCoversGroup(root, packageJson, 'open-world'), 'Open World tests omitted from test:js.');
const workflow = readFileSync(resolve(root, '../.github/workflows/deploy-demian-pages.yml'), 'utf8');
assert(workflow.includes('npm run validate:phase8'), 'CI does not run validate:phase8.');
const lock = readFileSync(join(root, 'package-lock.json'), 'utf8');
assert(!/mirror-npm|runflare/i.test(lock), 'package-lock references a private mirror.');

const phpFiles = lintPhpFiles(root, assert);

if (failures.length > 0) {
    console.error(`Phase 8 validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}
console.log(`Phase 8 source validation passed: ${jsFiles.length} JavaScript/MJS, ${phpFiles.length} PHP, ${manifest.chunks.length} chunks, ${manifest.districts.length} districts and ${manifest.savePoints.length} save points checked.`);
