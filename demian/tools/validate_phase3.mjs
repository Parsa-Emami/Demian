import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function walk(directory, predicate = () => true) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const absolute = join(directory, entry);
        const stat = statSync(absolute);
        if (stat.isDirectory()) files.push(...walk(absolute, predicate));
        else if (predicate(absolute)) files.push(absolute);
    }
    return files;
}

function assert(condition, message) {
    if (!condition) failures.push(message);
}

const javascriptFiles = [
    ...walk(join(root, 'resources/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tests/js'), (file) => extname(file) === '.js'),
];

for (const file of javascriptFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(result.status === 0, `Syntax error: ${file}\n${result.stderr}`);

    const source = readFileSync(file, 'utf8');
    const imports = [
        ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]).filter((specifier) => specifier.startsWith('.'));

    for (const specifier of imports) {
        const base = resolve(dirname(file), specifier);
        const candidates = [base, `${base}.js`, join(base, 'index.js')];
        assert(candidates.some(existsSync), `Unresolved relative import "${specifier}" in ${file}`);
    }
}

const requiredTetrisFiles = [
    'resources/js/game/games/tetris/TetrisGame.js',
    'resources/js/game/games/tetris/systems/TetrisEngine.js',
    'resources/js/game/games/tetris/domain/Board.js',
    'resources/js/game/games/tetris/domain/RotationSystem.js',
    'resources/js/game/games/tetris/domain/PieceBag.js',
    'resources/js/game/games/tetris/render/TetrisRenderer.js',
    'resources/js/game/games/tetris/ui/TetrisHud.js',
    'resources/js/game/games/tetris/replay/ReplayRecorder.js',
];
requiredTetrisFiles.forEach((file) => assert(existsSync(join(root, file)), `Missing ${file}`));

const blade = readFileSync(join(root, 'resources/views/demian.blade.php'), 'utf8');
['boot', 'cafe-menu', 'game-selection', 'loading', 'pause', 'settings', 'results']
    .forEach((screen) => assert(blade.includes(`data-screen="${screen}"`), `Missing screen ${screen}`));
assert(blade.includes('data-game-hud-host'), 'Missing game HUD host');
assert(blade.includes('data-results-replay'), 'Missing replay action');

const css = readFileSync(join(root, 'resources/css/app.css'), 'utf8');
const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert((strippedCss.match(/{/g) ?? []).length === (strippedCss.match(/}/g) ?? []).length, 'CSS braces are unbalanced');
assert(css.includes('[data-control-layout="tetris"]'), 'Missing Tetris control-layout CSS');

const definitions = readFileSync(join(root, 'resources/js/game/registry/GameDefinitions.js'), 'utf8');
assert(definitions.includes("tetris: Object.freeze"), 'Tetris is not registered lazily');
assert(definitions.includes("inputContext: 'TETRIS'"), 'Tetris input context is not registered');

if (failures.length > 0) {
    console.error(`Phase 3 validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`Phase 3 source validation passed: ${javascriptFiles.length} JavaScript files checked.`);
