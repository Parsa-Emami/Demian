import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { testRunnerCoversGroup } from './validation/testRunnerContract.mjs';
import { validateEventDefinition } from '../resources/js/game/games/event/core/EventDefinitionValidator.js';
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
        const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.json`, join(base, 'index.js')];
        assert(candidates.some(existsSync), `Unresolved relative import "${specifier}" in ${file}`);
    }
}

const required = [
    'resources/js/game/games/event/EventGame.js',
    'resources/js/game/games/event/EventRegistry.js',
    'resources/js/game/games/event/EventDefinitionLoader.js',
    'resources/js/game/games/event/core/EventDefinitionValidator.js',
    'resources/js/game/games/event/core/EventDirector.js',
    'resources/js/game/games/event/objectives/ObjectiveFactory.js',
    'resources/js/game/games/event/objectives/CollectObjective.js',
    'resources/js/game/games/event/objectives/ReachObjective.js',
    'resources/js/game/games/event/objectives/SurviveObjective.js',
    'resources/js/game/games/event/objectives/DefeatObjective.js',
    'resources/js/game/games/event/objectives/ScoreObjective.js',
    'resources/js/game/games/event/modifiers/ModifierSystem.js',
    'resources/js/game/games/event/rewards/RewardResolver.js',
    'resources/js/game/games/event/persistence/EventRewardStore.js',
    'resources/js/game/games/event/protocol/EventProtocol.js',
    'resources/js/game/games/event/render/EventRenderer.js',
    'resources/js/game/games/event/ui/EventHud.js',
    'resources/js/game/games/event/definitions/cafe-rush.json',
    'resources/js/game/games/event/definitions/neon-collector.json',
    'resources/js/game/games/event/definitions/survival-night.json',
    'resources/js/game/games/event/schemas/event-definition.schema.json',
    'resources/js/game/games/event/config/EventConfig.js',
    'resources/js/game/games/event/maps/EventArenaMap.js',
    'resources/js/game/games/event/network/EventApiClient.js',
    'resources/js/game/games/event/systems/EventScoreSystem.js',
    'docs/EVENT-FRAMEWORK.fa.md',
    'config/demian-events.php',
    'app/Models/EventSession.php',
    'app/Models/EventRewardClaim.php',
    'app/Services/Events/EventDefinitionRepository.php',
    'app/Services/Events/EventDefinitionValidator.php',
    'app/Services/Events/EventSessionService.php',
    'app/Http/Controllers/Api/V1/EventController.php',
    'app/Http/Controllers/Api/V1/EventSessionController.php',
    'database/migrations/2026_07_29_000100_create_event_sessions_table.php',
    'tests/Feature/EventFrameworkApiTest.php',
    'tests/Unit/EventDefinitionValidatorTest.php',
];
required.forEach((file) => assert(existsSync(join(root, file)), `Missing ${file}`));

const definitionFiles = walk(
    join(root, 'resources/js/game/games/event/definitions'),
    (file) => extname(file) === '.json'
);
assert(definitionFiles.length >= 3, 'At least three event definitions are required.');
for (const file of definitionFiles) {
    const definition = JSON.parse(readFileSync(file, 'utf8'));
    const errors = validateEventDefinition(definition);
    assert(errors.length === 0, `Invalid event definition ${file}: ${errors.join('; ')}`);
}

const domainDirectories = ['core', 'objectives', 'modifiers', 'rewards', 'systems', 'protocol', 'persistence'];
const domainFiles = domainDirectories.flatMap((directory) =>
    walk(join(root, `resources/js/game/games/event/${directory}`), (file) => extname(file) === '.js')
);
domainFiles.push(
    join(root, 'resources/js/game/games/event/EventRegistry.js'),
    join(root, 'resources/js/game/games/event/EventDefinitionLoader.js')
);
for (const file of domainFiles) {
    const source = readFileSync(file, 'utf8');
    assert(!source.includes("from 'three'"), `Event domain imports Three.js: ${file}`);
    assert(!/\b(document|window|HTMLElement|HTMLCanvasElement)\b/.test(source), `Event domain depends on DOM globals: ${file}`);
    assert(!/\b(TODO|FIXME|debugger|console\.log)\b/.test(source), `Debug marker found: ${file}`);
}

const game = readFileSync(join(root, 'resources/js/game/games/event/EventGame.js'), 'utf8');
for (const marker of [
    'new EventRegistry', 'new EventDirector', 'new RewardResolver', 'new EventRewardStore',
    "createScope('event')", 'navigationGrid.findPath', 'collisionScope.addDynamicCircle',
    'director.dispatch', 'processRewards', 'createCompletionPayload', 'completeSession', 'completeGame', 'createEventSnapshot',
]) assert(game.includes(marker), `EventGame integration missing: ${marker}`);

const application = readFileSync(join(root, 'resources/js/game/application/GameApplication.js'), 'utf8');
assert(application.includes('await this.activeGame.startSession?.(params)'), 'GameApplication does not await asynchronous session initialization.');

const definitions = readFileSync(join(root, 'resources/js/game/registry/GameDefinitions.js'), 'utf8');
for (const marker of [
    'event: Object.freeze', "inputContext: 'EVENT'", "loader: () => import('../games/event/EventGame.js')",
    'dataDriven: true', 'remoteDefinitionsReady: true',
]) assert(definitions.includes(marker), `Game definition missing: ${marker}`);

const catalog = readFileSync(join(root, 'resources/js/game/catalog/GameCatalog.js'), 'utf8');
const eventCatalog = catalog.slice(catalog.indexOf("id: 'event'"), catalog.indexOf("id: 'role-play'"));
assert(eventCatalog.includes("status: 'available'"), 'Event catalog status is not available.');
assert(eventCatalog.includes('available: true'), 'Event catalog is not playable.');

const input = readFileSync(join(root, 'resources/js/game/input/InputContexts.js'), 'utf8');
for (const marker of ['EVENT: Object.freeze', "eventAction: pressed('space', 'e', 'eventAction')", "pause: pressed('escape', 'pause')"]) {
    assert(input.includes(marker), `Event input marker missing: ${marker}`);
}
const controls = readFileSync(join(root, 'resources/js/game/controls/ControlLayoutService.js'), 'utf8');
assert(controls.includes("EVENT: Object.freeze({ id: 'event', joystick: true })"), 'Event mobile control layout is missing.');

const css = readFileSync(join(root, 'resources/css/app.css'), 'utf8');
const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert((strippedCss.match(/{/g) ?? []).length === (strippedCss.match(/}/g) ?? []).length, 'CSS braces are unbalanced.');
for (const marker of ['.event-hud', '.event-touch-actions', 'data-control-layout="event"']) {
    assert(css.includes(marker), `Event CSS missing: ${marker}`);
}

const apiRoutes = readFileSync(join(root, 'routes/api.php'), 'utf8');
for (const marker of ['/events/active', '/events/{event}/sessions', '/event-sessions/{eventSession}/complete']) {
    assert(apiRoutes.includes(marker), `Event API route is missing: ${marker}`);
}
const bootstrap = readFileSync(join(root, 'bootstrap/app.php'), 'utf8');
assert(bootstrap.includes("api: __DIR__.'/../routes/api.php'"), 'Laravel API routes are not registered.');

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert(packageJson.scripts?.['validate:phase6'] === 'node tools/validate_phase6.mjs', 'validate:phase6 script is missing.');
assert(testRunnerCoversGroup(root, packageJson, 'event'), 'test:js omits Event Framework tests.');
const workflow = readFileSync(resolve(root, '../.github/workflows/deploy-demian-pages.yml'), 'utf8');
assert(workflow.includes('npm run validate:phase6'), 'CI does not run validate:phase6.');
assert(workflow.includes('php artisan test'), 'CI does not run Laravel tests.');
assert(!workflow.includes('--no-dev'), 'CI omits Composer development dependencies required for PHPUnit.');

const lockText = readFileSync(join(root, 'package-lock.json'), 'utf8');
assert(!/mirror-npm|runflare/i.test(lockText), 'package-lock references a private mirror.');

const phpFiles = lintPhpFiles(root, assert);

if (failures.length > 0) {
    console.error(`Phase 6 validation failed (${failures.length}):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`Phase 6 source validation passed: ${javascriptFiles.length} JavaScript/MJS, ${phpFiles.length} PHP and ${definitionFiles.length} event definitions checked.`);
