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
    const imports = file.startsWith(join(root, 'tools')) ? [] : [
        ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]).filter((specifier) => specifier.startsWith('.'));

    for (const specifier of imports) {
        const base = resolve(dirname(file), specifier);
        const candidates = [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')];
        assert(candidates.some(existsSync), `Unresolved relative import "${specifier}" in ${file}`);
    }
}

const requiredPhase4Files = [
    'resources/js/game/shared/collision/Collider.js',
    'resources/js/game/shared/collision/CollisionWorld.js',
    'resources/js/game/shared/collision/SpatialHash.js',
    'resources/js/game/shared/collision/CollisionMath.js',
    'resources/js/game/shared/interaction/InteractionService.js',
    'resources/js/game/shared/interaction/ui/InteractionPrompt.js',
    'resources/js/game/shared/navigation/NavigationGrid.js',
    'resources/js/game/shared/navigation/NavigationService.js',
    'resources/js/game/world/OpenWorldManifest.js',
    'tests/js/collision/CollisionWorld.test.js',
    'tests/js/interaction/InteractionService.test.js',
    'tests/js/navigation/NavigationGrid.test.js',
];
requiredPhase4Files.forEach((file) => assert(existsSync(join(root, file)), `Missing ${file}`));

const legacyCafeScenePolicy = join(root, 'resources/js/game/shared/cafe/CafeScenePolicy.js');
assert(
    !existsSync(legacyCafeScenePolicy),
    'Obsolete Three.js café scene policy still exists inside the renderer-neutral shared domain.'
);

const threeImportPattern = /(?:\bfrom\s+|\bimport\s*\(\s*)['"]three['"]/;
const phase4DomainFiles = walk(join(root, 'resources/js/game/shared'), (file) => extname(file) === '.js')
    .filter((file) => !file.endsWith('InteractionPrompt.js'));
phase4DomainFiles.forEach((file) => {
    const source = readFileSync(file, 'utf8');
    assert(!threeImportPattern.test(source), `Shared phase-four domain imports Three.js: ${file}`);
    assert(!/\bTHREE\s*\./.test(source), `Shared phase-four domain references the Three.js namespace: ${file}`);
    assert(!/\b(document|window|HTMLElement)\b/.test(source), `Shared phase-four domain depends on DOM globals: ${file}`);
    assert(!/\b(TODO|FIXME|debugger|console\.log)\b/.test(source), `Debug marker found: ${file}`);
});

const application = readFileSync(join(root, 'resources/js/game/application/GameApplication.js'), 'utf8');
for (const marker of [
    'new CollisionWorld',
    'new InteractionService',
    'new NavigationService',
    'collision: this.collision',
    'interaction: this.interaction',
    'navigation: this.navigation',
]) assert(application.includes(marker), `GameApplication missing shared service marker: ${marker}`);

const openWorld = readFileSync(join(root, 'resources/js/game/games/open-world/OpenWorldGame.js'), 'utf8');
for (const marker of [
    'setupWorldServices()',
    'registerWorldInteractions()',
    'updateInteraction(gameplayInput)',
    'collisionScope',
    'navigationGrid',
    'InteractionPrompt',
]) assert(openWorld.includes(marker), `OpenWorld integration missing: ${marker}`);

const character = readFileSync(join(root, 'resources/js/game/characters/SpriteCharacter.js'), 'utf8');
assert(character.includes('setMovementResolver'), 'SpriteCharacter has no collision movement adapter');
assert(character.includes('applyHorizontalMovement'), 'SpriteCharacter does not route movement through collision');

const npc = readFileSync(join(root, 'resources/js/game/npc/NpcBrain.js'), 'utf8');
assert(npc.includes('navigationGrid.findPath'), 'NPC brain does not consume NavigationGrid paths');

const input = readFileSync(join(root, 'resources/js/game/input/InputContexts.js'), 'utf8');
assert(input.includes("interact: pressed('enter', 'interact')"), 'Open World interact action is not registered');

const blade = readFileSync(join(root, 'resources/views/demian.blade.php'), 'utf8');
assert(blade.includes('data-input-press="interact"'), 'Mobile interaction button is missing');
assert(blade.includes('<b class="text-white">Enter</b> interact'), 'Desktop interaction help is missing');

const css = readFileSync(join(root, 'resources/css/app.css'), 'utf8');
const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert((strippedCss.match(/{/g) ?? []).length === (strippedCss.match(/}/g) ?? []).length, 'CSS braces are unbalanced');
assert(css.includes('.interaction-prompt'), 'Interaction prompt CSS is missing');
assert(css.includes('.touch-action--interact'), 'Mobile interaction CSS is missing');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert(packageJson.scripts?.['validate:phase4'] === 'node tools/validate_phase4.mjs', 'validate:phase4 script is missing');
for (const group of ['collision', 'interaction', 'navigation', 'world']) {
    assert(testRunnerCoversGroup(root, packageJson, group), `test:js omits ${group} tests`);
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const lockText = JSON.stringify(lock);
assert(!/mirror-npm|runflare/i.test(lockText), 'package-lock still references a private mirror');

const phpFiles = lintPhpFiles(root, assert);

if (failures.length > 0) {
    console.error(`Phase 4 validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`Phase 4 source validation passed: ${javascriptFiles.length} JavaScript/MJS and ${phpFiles.length} PHP files checked.`);
