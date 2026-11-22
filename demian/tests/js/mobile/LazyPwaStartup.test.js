import test from 'node:test';
import assert from 'node:assert/strict';
import { splitOfflineModules, OFFLINE_GAME_IDS } from '../../../tools/offline_pack_manifest.mjs';

test('all seven game packages retain their shared CSS but exclude it from the PWA core', () => {
    const games = {
        'open-world': 'open-world/OpenWorldGame.js',
        'dino-run': 'dino-run/DinoRunGame.js',
        'after-hours': 'after-hours/AfterHoursGame.js',
        'cafe-rush': 'cafe-rush/CafeRushGame.js',
        'cafe-critters': 'cafe-critters/CafeCrittersGame.js',
        'coffee-crash': 'coffee-crash/CoffeeCrashGame.js',
        'cafe-drift': 'cafe-drift/CafeDriftGame.js',
    };
    const styleNames = ['phase5-step23-dino-run', 'after-hours', 'cafe-rush',
        'cafe-critters', 'coffee-crash', 'cafe-drift'];
    const vite = {
        'resources/js/app.js': { file: 'assets/app.js', isEntry: true, dynamicImports: [
            ...Object.values(games).map(file => 'resources/js/game/games/' + file),
            ...styleNames.map(name => 'resources/css/' + name + '.css'),
            'resources/js/game/performance/PwaUpdateController.js',
        ] },
        'resources/js/game/performance/PwaUpdateController.js': {
            file: 'assets/pwa.js', isDynamicEntry: true },
    };
    for (const [id, path] of Object.entries(games)) {
        vite['resources/js/game/games/' + path] = { file: 'assets/' + id + '.js', isDynamicEntry: true };
    }
    for (const name of styleNames) {
        vite['resources/css/' + name + '.css'] = {
            file: 'assets/' + name + '.css', isDynamicEntry: true };
    }
    const { core, games: packs } = splitOfflineModules(vite);
    assert.ok(core.includes('build/assets/pwa.js'));
    assert.deepEqual(Object.keys(packs), OFFLINE_GAME_IDS);
    assert.ok(!core.some(path => path.includes('after-hours.css')));
    for (const id of ['after-hours', 'cafe-rush', 'cafe-critters'])
        assert.ok(packs[id].includes('build/assets/after-hours.css'));
    assert.ok(packs['cafe-drift'].includes('build/assets/cafe-drift.css'));
    assert.ok(packs['dino-run'].includes('build/assets/phase5-step23-dino-run.css'));
    assert.ok(!packs['open-world'].some(path => path.endsWith('.css')));
});
