import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = resolve(import.meta.dirname, '..');
const option = process.argv.indexOf('--build-root');
const buildRoot = option >= 0
    ? resolve(process.cwd(), process.argv[option + 1] ?? '')
    : resolve(projectRoot, 'public/build');
const failures = [];
const fail = message => failures.push(message);
const filePath = path => resolve(buildRoot, path);
let manifest = null;
try {
    manifest = JSON.parse(readFileSync(filePath('manifest.json'), 'utf8'));
} catch (error) {
    fail('Missing Vite build manifest: ' + error.message);
    manifest = {};
}
const entryKey = 'resources/js/app.js';
const entry = manifest[entryKey];
if (!entry?.isEntry || !entry.file) fail('Missing app JavaScript entry');
const nameOK = path => typeof path === 'string'
    && /^assets\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(path)
    && !path.split('/').some(part => part === '..' || part === '.');
function checkFile(path) {
    if (!nameOK(path)) { fail('Unsafe build filename: ' + String(path)); return; }
    const absolute = filePath(path);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile() || lstatSync(absolute).size === 0) {
        fail('Missing or empty split build resource: ' + path);
    }
}
for (const [key, row] of Object.entries(manifest)) {
    if (row.file) checkFile(row.file);
    for (const asset of [...(row.css ?? []), ...(row.assets ?? [])]) checkFile(asset);
    for (const ref of [...(row.imports ?? []), ...(row.dynamicImports ?? [])]) {
        if (!manifest[ref]) fail('Unresolved Vite manifest import: ' + key + ' -> ' + ref);
    }
}
const games = [
    'open-world/OpenWorldGame.js', 'dino-run/DinoRunGame.js',
    'after-hours/AfterHoursGame.js', 'cafe-rush/CafeRushGame.js',
    'cafe-critters/CafeCrittersGame.js', 'coffee-crash/CoffeeCrashGame.js', 'cafe-drift/CafeDriftGame.js',
];
const unique = new Set([entry?.file]);
for (const game of games) {
    const key = 'resources/js/game/games/' + game;
    const row = manifest[key];
    if (!row?.file || !row.isDynamicEntry || row.file === entry?.file) {
        fail('Missing separate dynamic game module: ' + key);
    } else {
        unique.add(row.file);
        if (!row.file.endsWith('.js')) fail('Invalid game chunk extension: ' + row.file);
    }
}
if (unique.size !== games.length + 1) fail('Game modules are not separately emitted');
if (entry?.file && existsSync(filePath(entry.file))) {
    const bytes = gzipSync(readFileSync(filePath(entry.file))).length;
    if (bytes > 340 * 1024) fail('Startup bundle exceeds 340 KiB compressed: ' + bytes);
}
if (failures.length) {
    console.error('Versioned chunk build rejected (' + failures.length + '):\n'
        + failures.map(x => '- ' + x).join('\n'));
    process.exit(1);
}
console.log('Versioned dynamic chunk build validated: ' + unique.size
    + ' entry/game files; startup gzip ' + gzipSync(readFileSync(filePath(entry.file))).length + ' bytes.');
