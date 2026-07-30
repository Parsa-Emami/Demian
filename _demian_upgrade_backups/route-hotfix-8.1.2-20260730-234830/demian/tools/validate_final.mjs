import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const projectRoot = resolve(root, '..');
const failures = [];

function walk(directory, predicate = () => true) {
    if (!existsSync(directory)) return [];
    const output = [];
    for (const entry of readdirSync(directory)) {
        const file = join(directory, entry);
        const stat = statSync(file);
        if (stat.isDirectory()) output.push(...walk(file, predicate));
        else if (predicate(file)) output.push(file);
    }
    return output;
}

function assert(condition, message) {
    if (!condition) failures.push(message);
}

const requiredPhaseDocs = [
    'docs/PHASE-1-GAME-PLATFORM.md',
    'docs/PHASE-2-GAME-SHELL.fa.md',
    'docs/PHASE-3-TETRIS.fa.md',
    'docs/PHASE-4-COLLISION-INTERACTION.fa.md',
    'docs/PHASE-5-HIDE-AND-SEEK.fa.md',
    'docs/PHASE-6-EVENT-FRAMEWORK.fa.md',
    'docs/PHASE-7-ROLE-PLAY.fa.md',
    'docs/PHASE-8-OPEN-WORLD.fa.md',
    'docs/FINAL-INTEGRATION-AND-MOBILE-UX.fa.md',
];
requiredPhaseDocs.forEach((file) => assert(existsSync(join(root, file)), `Missing cumulative delivery document: ${file}`));

const requiredFinalFiles = [
    'resources/js/ui/ScrollSnapRail.js',
    'resources/js/ui/CharacterManagerUI.js',
    'resources/js/ui/MobileGameUI.js',
    'resources/js/ui/SidebarController.js',
    'resources/js/game/shell/screens/GameSelectionScreen.js',
    'tests/js/ScrollSnapRail.test.js',
    'tests/js/MobileViewportPolicy.test.js',
    'FINAL-VERSION.txt',
];
requiredFinalFiles.forEach((file) => assert(existsSync(join(root, file)), `Missing final integration file: ${file}`));

const jsFiles = [
    ...walk(join(root, 'resources/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tests/js'), (file) => extname(file) === '.js'),
    ...walk(join(root, 'tools'), (file) => extname(file) === '.mjs'),
];
for (const file of jsFiles) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert(check.status === 0, `JavaScript syntax error: ${file}\n${check.stderr}`);

    const source = readFileSync(file, 'utf8');
    const imports = file.startsWith(join(root, 'tools')) ? [] : [
        ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]).filter((specifier) => specifier.startsWith('.'));

    for (const specifier of imports) {
        const base = resolve(dirname(file), specifier);
        assert(
            [base, `${base}.js`, `${base}.mjs`, `${base}.json`, join(base, 'index.js')].some(existsSync),
            `Unresolved relative import "${specifier}" in ${file}`
        );
    }
}

const blade = readFileSync(join(root, 'resources/views/demian.blade.php'), 'utf8');
for (const marker of [
    'data-runtime-version="8.1.0-final"',
    'data-character-scroll-previous',
    'data-character-scroll-next',
    'data-character-scroll-status',
    'class="character-selection-rail',
    'data-game-scroll-previous',
    'data-game-scroll-next',
    'data-game-scroll-status',
    'aria-label="کتابخانه بازی‌های دمیان"',
]) assert(blade.includes(marker), `Final Blade UI marker missing: ${marker}`);
assert(!blade.includes('user-scalable=no'), 'Viewport still disables user zoom.');

const rail = readFileSync(join(root, 'resources/js/ui/ScrollSnapRail.js'), 'utf8');
for (const marker of [
    'nearestRailIndex',
    'clampRailIndex',
    'scrollIntoView',
    'ResizeObserver',
    'aria-posinset',
    'aria-setsize',
    'onKeyDown',
    'dispose()',
]) assert(rail.includes(marker), `ScrollSnapRail capability missing: ${marker}`);

const characterUi = readFileSync(join(root, 'resources/js/ui/CharacterManagerUI.js'), 'utf8');
for (const marker of [
    "import ScrollSnapRail",
    'bindCharacterRail',
    "itemSelector: '[data-character-card]'",
    'preferredItem: activeCard',
    "character-ui:activated",
]) assert(characterUi.includes(marker), `Character selection refactor missing: ${marker}`);

const gameSelection = readFileSync(join(root, 'resources/js/game/shell/screens/GameSelectionScreen.js'), 'utf8');
for (const marker of [
    'import ScrollSnapRail',
    'data-scroll-rail-item',
    "itemSelector: '[data-game-card]'",
    'this.rail?.refresh',
    'this.rail?.dispose',
]) assert(gameSelection.includes(marker), `Game library refactor missing: ${marker}`);

const mobileUi = readFileSync(join(root, 'resources/js/ui/MobileGameUI.js'), 'utf8');
for (const marker of [
    'resolveMobileViewportMode',
    'shouldForceLandscape',
    "return 'character-sheet'",
    "mode === 'gameplay'",
    "this.root.addEventListener('sidebar:changed'",
    'await this.unlockOrientation()',
    'MutationObserver',
    'data-session-state',
]) assert(mobileUi.includes(marker), `Mobile viewport policy missing: ${marker}`);

const sidebar = readFileSync(join(root, 'resources/js/ui/SidebarController.js'), 'utf8');
for (const marker of [
    'onCharacterActivated',
    "character-ui:activated",
    "this.state = 'collapsed'",
]) assert(sidebar.includes(marker), `Sidebar mobile selection behavior missing: ${marker}`);

const css = readFileSync(join(root, 'resources/css/app.css'), 'utf8');
for (const marker of [
    'Demian Final · Mobile presentation and scrollable selection refactor',
    '.character-selection-rail',
    'scroll-snap-type: x mandatory',
    'scroll-snap-stop: always',
    'overflow-x: auto',
    '-webkit-overflow-scrolling: touch',
    'body.has-mobile-sheet',
    'touch-action: auto',
    '.game-library-toolbar',
    '.game-card.is-rail-current',
    '100dvh',
    '100svh',
]) assert(css.includes(marker), `Final responsive CSS capability missing: ${marker}`);
const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert((strippedCss.match(/{/g) ?? []).length === (strippedCss.match(/}/g) ?? []).length, 'CSS braces are unbalanced.');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert(packageJson.version === '8.1.0', 'package.json final version is not 8.1.0.');
assert(packageJson.scripts?.['validate:final'] === 'node tools/validate_final.mjs', 'validate:final script missing.');
assert(packageJson.scripts?.['test:js']?.includes('tests/js/*.test.js'), 'Root JavaScript tests are omitted.');

const workflow = readFileSync(join(projectRoot, '.github/workflows/deploy-demian-pages.yml'), 'utf8');
assert(workflow.includes('npm run validate:final'), 'CI does not run the final validator.');
assert(workflow.includes('data-runtime-version="8.1.0-final"'), 'Static deployment does not verify final runtime version.');

const lock = readFileSync(join(root, 'package-lock.json'), 'utf8');
assert(!/mirror-npm|runflare/i.test(lock), 'package-lock references a private mirror.');

const phaseMarkers = [
    'resources/js/game/runtime/GameRuntime.js',
    'resources/js/game/shell/GameShell.js',
    'resources/js/game/games/tetris/TetrisGame.js',
    'resources/js/game/shared/collision/CollisionWorld.js',
    'resources/js/game/games/hide-and-seek/HideAndSeekGame.js',
    'resources/js/game/games/event/EventGame.js',
    'resources/js/game/games/role-play/RolePlayGame.js',
    'resources/js/game/games/open-world/OpenWorldGame.js',
];
phaseMarkers.forEach((file) => assert(existsSync(join(root, file)), `Cumulative phase implementation missing: ${file}`));

const phpFiles = walk(root, (file) => extname(file) === '.php');
for (const file of phpFiles) {
    const check = spawnSync('php', ['-l', file], { encoding: 'utf8' });
    assert(check.status === 0, `PHP syntax error: ${file}\n${check.stderr}`);
}

if (failures.length > 0) {
    console.error(`Final project validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`Final project validation passed: ${jsFiles.length} JavaScript/MJS and ${phpFiles.length} PHP files checked; phases 1-8 and mobile scroll refactor verified.`);
