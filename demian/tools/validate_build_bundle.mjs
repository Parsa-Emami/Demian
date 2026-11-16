/** Assert independently deployed game chunks and all Vite dependency edges. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = resolve(import.meta.dirname, '..');
const index = process.argv.indexOf('--build-root');
const root = index >= 0 ? resolve(process.cwd(), process.argv[index + 1] ?? '') :
    resolve(projectRoot, 'public/build');
const failures = [];
const fail = message => failures.push(message);
const gameSources = Object.freeze({
    'open-world': 'resources/js/game/games/open-world/OpenWorldGame.js',
    'dino-run': 'resources/js/game/games/dino-run/DinoRunGame.js',
    'after-hours': 'resources/js/game/games/after-hours/AfterHoursGame.js',
    'cafe-rush': 'resources/js/game/games/cafe-rush/CafeRushGame.js',
    'cafe-critters': 'resources/js/game/games/cafe-critters/CafeCrittersGame.js',
    'coffee-crash': 'resources/js/game/games/coffee-crash/CoffeeCrashGame.js',
});
let manifest = {};
try {
    manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
} catch (error) {
    fail('Missing or invalid Vite manifest: ' + error.message);
}
const entry = manifest['resources/js/app.js'];
if (!entry?.isEntry || !entry.file) fail('Application entry is missing.');
const safe = file => typeof file === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(file) &&
    !file.includes('..') && !file.startsWith('/');
const checkFile = (file, source) => {
    if (!safe(file)) { fail('Unsafe output path from ' + source + ': ' + file); return; }
    const target = resolve(root, file);
    if (!target.startsWith(root + sep) || !existsSync(target) || !statSync(target).isFile()) {
        fail('Missing output file from ' + source + ': ' + file);
    }
};
for (const [source, asset] of Object.entries(manifest)) {
    if (asset.file) checkFile(asset.file, source);
    for (const file of [...(asset.css ?? []), ...(asset.assets ?? [])]) checkFile(file, source);
    for (const dependency of [...(asset.imports ?? []), ...(asset.dynamicImports ?? [])]) {
        if (!manifest[dependency]) fail('Unresolved manifest import: ' + source + ' -> ' + dependency);
    }
}
const gameFiles = [];
for (const [game, source] of Object.entries(gameSources)) {
    const row = manifest[source];
    if (!row?.file || !row.isDynamicEntry || row.file === entry?.file) {
        fail('Game did not emit a separate dynamic chunk: ' + game);
        continue;
    }
    gameFiles.push(row.file);
    if (!row.file.endsWith('.js')) fail('Invalid game JS chunk: ' + row.file);
}
if (new Set(gameFiles).size !== 6) fail('Every game must have a distinct JS chunk.');
if (!entry?.file?.endsWith('.js')) fail('Application entry must be JavaScript.');
let gzipBytes = 0;
if (entry?.file && safe(entry.file) && existsSync(join(root, entry.file))) {
    gzipBytes = gzipSync(readFileSync(join(root, entry.file))).byteLength;
    if (gzipBytes >= 400 * 1024) fail('Initial shell exceeds 400 KiB gzip: ' + gzipBytes);
}
const javascriptFiles = existsSync(join(root, 'assets'))
    ? readdirSync(join(root, 'assets')).filter(name => name.endsWith('.js')) : [];
if (javascriptFiles.length < 7) fail('Expected shell and at least six lazy JS chunks.');
if (failures.length) {
    console.error('Lazy chunk validation failed:\n' + failures.map(row => '- ' + row).join('\n'));
    process.exitCode = 1;
} else {
    console.log('Lazy Demian build: PASSED');
    console.log('Initial JS: ' + relative(root, join(root, entry.file)) + ' (' + gzipBytes + ' gzip bytes)');
    for (const [game, source] of Object.entries(gameSources)) {
        console.log(game + ': ' + manifest[source].file);
    }
}
