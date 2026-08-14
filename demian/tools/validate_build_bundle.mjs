import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const buildRootArgumentIndex = process.argv.indexOf('--build-root');
const buildRoot = buildRootArgumentIndex >= 0
    ? resolve(process.cwd(), process.argv[buildRootArgumentIndex + 1] ?? '')
    : resolve(projectRoot, 'public/build');
const manifestPath = resolve(buildRoot, 'manifest.json');
const failures = [];

function fail(message) {
    failures.push(message);
}

function walk(directory) {
    if (!existsSync(directory)) return [];

    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = resolve(directory, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
    });
}

let manifest = null;
try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
    fail(`Vite manifest is missing or invalid: ${manifestPath} (${error.message})`);
}

const appEntry = manifest?.['resources/js/app.js'];
if (!appEntry?.isEntry || typeof appEntry.file !== 'string') {
    fail('resources/js/app.js is not a valid Vite entry.');
}

// With `rolldownOptions.output.codeSplitting: false` (see vite.config.js),
// Vite/Rolldown inlines every dynamic import() into the single entry chunk,
// but the manifest still records a `dynamicImports` metadata entry for the
// entry itself (self-referencing "resources/js/app.js" -> ["resources/js/app.js"]).
// That's just bookkeeping about what the source *syntactically* imports
// dynamically - it does not mean a separate deployment chunk was emitted.
//
// The real signal for "did this dynamic import actually produce a separate
// chunk file" is whether the imported module maps to a *different* physical
// output file than the importer. So instead of failing on any non-empty
// `dynamicImports` array, compare output files.
const outputFileBySource = new Map(
    Object.entries(manifest ?? {}).map(([source, entry]) => [source, entry?.file]),
);

for (const [source, entry] of Object.entries(manifest ?? {})) {
    const dynamicImports = Array.isArray(entry?.dynamicImports) ? entry.dynamicImports : [];
    const externalDynamicImports = dynamicImports.filter(
        (imported) => outputFileBySource.get(imported) !== entry?.file,
    );
    if (externalDynamicImports.length > 0) {
        fail(`${source} still emits dynamic deployment chunks: ${externalDynamicImports.join(', ')}`);
    }
}

const files = walk(buildRoot);
const javascriptFiles = files.filter((file) => file.endsWith('.js'));
const forbiddenGameChunk = /(?:RolePlayGame|OpenWorldGame|EventGame|HideAndSeekGame|TetrisGame)-/i;
const gameChunkFiles = javascriptFiles.filter((file) => forbiddenGameChunk.test(file));

if (gameChunkFiles.length > 0) {
    fail(`Standalone game chunks were generated: ${gameChunkFiles.map((file) => relative(buildRoot, file)).join(', ')}`);
}

if (javascriptFiles.length !== 1) {
    fail(`Expected one atomic JavaScript bundle, found ${javascriptFiles.length}: ${javascriptFiles.map((file) => relative(buildRoot, file)).join(', ')}`);
}

if (appEntry?.file) {
    const entryPath = resolve(buildRoot, appEntry.file);
    if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
        fail(`Manifest entry does not exist: ${appEntry.file}`);
    } else {
        const source = readFileSync(entryPath, 'utf8');
        if (forbiddenGameChunk.test(source)) {
            fail('The atomic application bundle still references a standalone hashed game chunk.');
        }
    }
}

if (failures.length > 0) {
    console.error(`Atomic bundle validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log('Atomic Demian production bundle validated successfully.');
console.log(`JavaScript bundle: ${relative(buildRoot, javascriptFiles[0])}`);
