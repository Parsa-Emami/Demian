import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { testRunnerCoversGroup } from './validation/testRunnerContract.mjs';
import { walk, lintPhpFiles } from './validation/projectWalk.mjs';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function assert(condition, message) {
    if (!condition) failures.push(message);
}

const javascriptFiles = [
    ...walk(join(root, 'resources/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tests/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tools'), (file) => extname(file) === '.mjs'),
];

for (const file of javascriptFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(result.status === 0, `Syntax error: ${file}\n${result.stderr}`);

    const source = readFileSync(file, 'utf8');
    const imports = file.includes(`${join('tools', '')}`) ? [] : [
        ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]).filter((specifier) => specifier.startsWith('.'));

    for (const specifier of imports) {
        const base = resolve(dirname(file), specifier);
        const candidates = [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')];
        assert(candidates.some(existsSync), `Unresolved relative import "${specifier}" in ${file}`);
    }
}

const required = [
    'resources/js/game/games/hide-and-seek/HideAndSeekGame.js',
    'resources/js/game/games/hide-and-seek/config/HideAndSeekConfig.js',
    'resources/js/game/games/hide-and-seek/match/MatchDirector.js',
    'resources/js/game/games/hide-and-seek/match/MatchProtocol.js',
    'resources/js/game/games/hide-and-seek/match/RoleAssigner.js',
    'resources/js/game/games/hide-and-seek/match/RoundTimer.js',
    'resources/js/game/games/hide-and-seek/systems/HideSpotSystem.js',
    'resources/js/game/games/hide-and-seek/systems/VisibilitySystem.js',
    'resources/js/game/games/hide-and-seek/systems/TagSystem.js',
    'resources/js/game/games/hide-and-seek/systems/ScoreSystem.js',
    'resources/js/game/games/hide-and-seek/ai/SeekerBrain.js',
    'resources/js/game/games/hide-and-seek/ai/HiderBrain.js',
    'resources/js/game/games/hide-and-seek/ai/SearchMemory.js',
    'resources/js/game/games/hide-and-seek/maps/CafeHideMap.js',
    'resources/js/game/games/hide-and-seek/render/HideAndSeekRenderer.js',
    'resources/js/game/games/hide-and-seek/ui/HideAndSeekHud.js',
    'resources/js/game/games/hide-and-seek/persistence/HideAndSeekStatsStore.js',
    'tests/js/hide-and-seek/MatchDirector.test.js',
    'tests/js/hide-and-seek/VisibilitySystem.test.js',
    'tests/js/hide-and-seek/MapNavigationIntegration.test.js',
];
required.forEach((file) => assert(existsSync(join(root, file)), `Missing ${file}`));

const domainRoots = ['config', 'match', 'systems', 'ai', 'maps'];
domainRoots.flatMap((directory) => walk(join(root, `resources/js/game/games/hide-and-seek/${directory}`), (file) => extname(file) === '.js'))
    .forEach((file) => {
        const source = readFileSync(file, 'utf8');
        assert(!source.includes("from 'three'"), `Hide and Seek domain imports Three.js: ${file}`);
        assert(!/\b(document|window|HTMLElement|HTMLCanvasElement)\b/.test(source), `Hide and Seek domain depends on DOM globals: ${file}`);
        assert(!/\b(TODO|FIXME|debugger|console\.log)\b/.test(source), `Debug marker found: ${file}`);
    });

const game = readFileSync(join(root, 'resources/js/game/games/hide-and-seek/HideAndSeekGame.js'), 'utf8');
for (const marker of [
    'new MatchDirector',
    'new HideSpotSystem',
    'new VisibilitySystem',
    'new TagSystem',
    'new SeekerBrain',
    'new HiderBrain',
    "createScope('hide-and-seek')",
    'navigationGrid.findPath',
    'interactionScope.register',
    'collisionScope.addDynamicCircle',
    'completeGame',
]) assert(game.includes(marker), `HideAndSeekGame integration missing: ${marker}`);

const definitions = readFileSync(join(root, 'resources/js/game/registry/GameDefinitions.js'), 'utf8');
for (const marker of ["'hide-and-seek'", "inputContext: 'HIDE_AND_SEEK'", "loader: () => import('../games/hide-and-seek/HideAndSeekGame.js')", 'networkReady: true']) {
    assert(definitions.includes(marker), `Game definition missing: ${marker}`);
}

const catalog = readFileSync(join(root, 'resources/js/game/catalog/GameCatalog.js'), 'utf8');
const hideCatalog = catalog.slice(catalog.indexOf("id: 'hide-and-seek'"), catalog.indexOf("id: 'event'"));
assert(hideCatalog.includes("status: 'available'"), 'Hide and Seek catalog status is not available');
assert(hideCatalog.includes('available: true'), 'Hide and Seek catalog is not playable');

const input = readFileSync(join(root, 'resources/js/game/input/InputContexts.js'), 'utf8');
for (const marker of ['HIDE_AND_SEEK', "interact: pressed('enter', 'e', 'interact')", "revealPulse: pressed('r', 'revealPulse')"]) {
    assert(input.includes(marker), `Hide and Seek input marker missing: ${marker}`);
}

const controls = readFileSync(join(root, 'resources/js/game/controls/ControlLayoutService.js'), 'utf8');
assert(controls.includes("HIDE_AND_SEEK: Object.freeze({ id: 'hide-and-seek', joystick: true })"), 'Hide and Seek mobile layout is missing');

const css = readFileSync(join(root, 'resources/css/app.css'), 'utf8');
const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert((strippedCss.match(/{/g) ?? []).length === (strippedCss.match(/}/g) ?? []).length, 'CSS braces are unbalanced');
for (const marker of ['.hide-seek-hud', '.hide-seek-touch-actions', 'data-control-layout="hide-and-seek"']) {
    assert(css.includes(marker), `Hide and Seek CSS missing: ${marker}`);
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert(packageJson.scripts?.['validate:phase5'] === 'node tools/validate_phase5.mjs', 'validate:phase5 script is missing');
assert(testRunnerCoversGroup(root, packageJson, 'hide-and-seek'), 'test:js omits Hide and Seek tests');

const workflow = readFileSync(resolve(root, '../.github/workflows/deploy-demian-pages.yml'), 'utf8');
assert(workflow.includes('npm run validate:phase5'), 'CI does not run validate:phase5');

const lockText = readFileSync(join(root, 'package-lock.json'), 'utf8');
assert(!/mirror-npm|runflare/i.test(lockText), 'package-lock references a private mirror');

const phpFiles = lintPhpFiles(root, assert);

if (failures.length > 0) {
    console.error(`Phase 5 validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`Phase 5 source validation passed: ${javascriptFiles.length} JavaScript/MJS and ${phpFiles.length} PHP files checked.`);
