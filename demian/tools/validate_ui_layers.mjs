import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function fail(message) {
    failures.push(message);
}

function walk(directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    });
}

const layersPath = join(root, 'resources/css/layers.css');
const appCssPath = join(root, 'resources/css/app.css');
const bladePath = join(root, 'resources/views/demian.blade.php');
const layerModulePath = join(root, 'resources/js/game/ui/UiLayer.js');

for (const file of [layersPath, appCssPath, bladePath, layerModulePath]) {
    if (!existsSync(file)) fail(`Required UI layer file is missing: ${relative(root, file)}`);
}

const layersCss = existsSync(layersPath) ? readFileSync(layersPath, 'utf8') : '';
const appCss = existsSync(appCssPath) ? readFileSync(appCssPath, 'utf8') : '';
const blade = existsSync(bladePath) ? readFileSync(bladePath, 'utf8') : '';
const layerModule = existsSync(layerModulePath) ? readFileSync(layerModulePath, 'utf8') : '';

const tokenMatches = [...layersCss.matchAll(/(--z-[a-z0-9-]+)\s*:\s*(-?\d+)\s*;/g)];
const tokens = new Map(tokenMatches.map((match) => [match[1], Number(match[2])]));
const requiredTokens = [
    '--z-app-stage', '--z-app-sidebar-backdrop', '--z-app-sidebar', '--z-app-sidebar-control',
    '--z-app-system-overlay', '--z-app-toast', '--z-stage-canvas', '--z-stage-effects',
    '--z-stage-hud', '--z-stage-prompt', '--z-stage-controls', '--z-stage-overlay',
    '--z-stage-shell', '--z-stage-system', '--z-shell-screen', '--z-shell-modal',
    '--z-shell-toast', '--z-local-base', '--z-local-raised', '--z-local-control', '--z-local-sticky',
];
requiredTokens.forEach((token) => {
    if (!tokens.has(token)) fail(`Layer token is missing: ${token}`);
});

const orderedGroups = [
    ['--z-app-stage', '--z-app-sidebar-backdrop', '--z-app-sidebar', '--z-app-sidebar-control', '--z-app-system-overlay', '--z-app-toast'],
    ['--z-stage-canvas', '--z-stage-effects', '--z-stage-hud', '--z-stage-prompt', '--z-stage-controls', '--z-stage-overlay', '--z-stage-shell', '--z-stage-system'],
    ['--z-shell-screen', '--z-shell-modal', '--z-shell-toast'],
    ['--z-local-base', '--z-local-raised', '--z-local-control', '--z-local-sticky'],
];
for (const group of orderedGroups) {
    for (let index = 1; index < group.length; index += 1) {
        const previous = tokens.get(group[index - 1]);
        const current = tokens.get(group[index]);
        if (Number.isFinite(previous) && Number.isFinite(current) && current <= previous) {
            fail(`Layer order must be strictly increasing: ${group[index - 1]} < ${group[index]}`);
        }
    }
}

if (!appCss.includes('@import "./layers.css";')) {
    fail('resources/css/app.css must import the central layer contract.');
}

const cssWithoutComments = appCss.replace(/\/\*[\s\S]*?\*\//g, '');
for (const match of cssWithoutComments.matchAll(/z-index\s*:\s*([^;]+);/g)) {
    const value = match[1].trim();
    if (!/^(?:var\(|calc\(|auto$|inherit$|initial$|unset$)/.test(value)) {
        fail(`Raw z-index value is forbidden in app.css: ${value}`);
    }
    for (const token of value.matchAll(/var\((--z-[a-z0-9-]+)/g)) {
        if (!tokens.has(token[1])) fail(`Undefined z-index token used in app.css: ${token[1]}`);
    }
}

const sourceFiles = [
    ...walk(join(root, 'resources/js')).filter((file) => extname(file) === '.js'),
    bladePath,
].filter(existsSync);

for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    const location = relative(root, file);
    const utility = source.match(/(?:^|\s)z-(?:\d+|\[[^\]]+\])(?=\s|["'])/);
    if (utility) fail(`Tailwind/raw z utility is forbidden in ${location}: ${utility[0].trim()}`);
    if (/\.style\.zIndex\s*=/.test(source) || /style\.setProperty\(\s*['"]z-index/.test(source)) {
        fail(`Imperative z-index mutation is forbidden in ${location}. Use assignUiLayer().`);
    }
}

const cssLayerNames = new Set(
    [...layersCss.matchAll(/\[data-ui-layer=["']([^"']+)["']\]/g)].map((match) => match[1])
);
const moduleLayerNames = new Set(
    [...layerModule.matchAll(/:\s*'([^']+)'\s*,/g)].map((match) => match[1])
);
for (const name of moduleLayerNames) {
    if (!cssLayerNames.has(name)) fail(`UiLayer.js value has no CSS mapping: ${name}`);
}
for (const name of cssLayerNames) {
    if (!moduleLayerNames.has(name)) fail(`layers.css mapping has no UiLayer.js value: ${name}`);
}

for (const match of blade.matchAll(/data-ui-layer=["']([^"']+)["']/g)) {
    if (!moduleLayerNames.has(match[1])) fail(`Blade uses unknown UI layer: ${match[1]}`);
}

const requiredBladeMarkers = [
    'data-ui-layer-root',
    'data-game-hud-host data-ui-layer="hud"',
    'data-game-prompt-host data-ui-layer="prompt"',
    'data-game-overlay-host data-ui-layer="game-overlay"',
    'data-game-shell data-ui-layer="shell"',
    'data-control-surface="world" data-ui-layer="controls"',
];
requiredBladeMarkers.forEach((marker) => {
    if (!blade.includes(marker)) fail(`Blade layer host marker is missing: ${marker}`);
});

const shellIndex = blade.indexOf('data-game-shell');
const hudIndex = blade.indexOf('data-game-hud-host');
const promptIndex = blade.indexOf('data-game-prompt-host');
const overlayIndex = blade.indexOf('data-game-overlay-host');
if (!(shellIndex >= 0 && shellIndex < hudIndex && hudIndex < promptIndex && promptIndex < overlayIndex)) {
    fail('Stage hosts must be ordered shell → HUD → prompt → overlay in source for predictable fallback painting.');
}

const dynamicLayerFiles = [
    'resources/js/game/shell/screens/BaseScreen.js',
    'resources/js/game/shared/interaction/ui/InteractionPrompt.js',
    'resources/js/game/games/tetris/ui/TetrisHud.js',
    'resources/js/game/games/hide-and-seek/ui/HideAndSeekHud.js',
    'resources/js/game/games/event/ui/EventHud.js',
    'resources/js/game/games/role-play/ui/RolePlayHud.js',
    'resources/js/game/games/open-world/ui/MiniMap.js',
    'resources/js/game/games/open-world/ui/WorldMap.js',
];
for (const file of dynamicLayerFiles) {
    const source = readFileSync(join(root, file), 'utf8');
    if (!source.includes('assignUiLayer')) fail(`Dynamic UI does not use assignUiLayer(): ${file}`);
}

if (failures.length > 0) {
    console.error(`UI layer validation failed (${failures.length}):`);
    failures.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
}

console.log(`UI layer validation passed: ${tokens.size} tokens, ${cssLayerNames.size} semantic layers, ${sourceFiles.length} UI source files checked.`);
