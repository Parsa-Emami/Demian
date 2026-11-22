// Verify Vite output and real release offline manifest rather than source text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitOfflineModules, OFFLINE_GAME_IDS } from './offline_pack_manifest.mjs';
const root = resolve(import.meta.dirname, '..');
const vite = JSON.parse(readFileSync(resolve(root, '_site/build/manifest.json'), 'utf8'));
const offline = JSON.parse(readFileSync(resolve(root, '_site/offline-packs.json'), 'utf8'));
const entry = vite['resources/js/app.js'];
assert.ok(entry?.isEntry, 'Missing Vite entry');
const eager = new Set();
function follow(key, visited = new Set()) {
    if (visited.has(key)) return;
    visited.add(key);
    const row = vite[key];
    assert.ok(row?.file, 'Invalid eager dependency: ' + key);
    eager.add('build/' + row.file);
    for (const css of row.css ?? []) eager.add('build/' + css);
    for (const child of row.imports ?? []) follow(child, visited);
}
follow('resources/js/app.js');
const graph = splitOfflineModules(vite);
const pwa = vite['resources/js/game/performance/PwaUpdateController.js'];
assert.ok(pwa?.isDynamicEntry, 'PWA controller must load after hydration');
assert.ok(!eager.has('build/' + pwa.file), 'PWA controller included in startup');
assert.ok(graph.core.includes('build/' + pwa.file), 'PWA absent from offline core');
const games = {
    'open-world': 'open-world/OpenWorldGame.js',
    'dino-run': 'dino-run/DinoRunGame.js',
    'after-hours': 'after-hours/AfterHoursGame.js',
    'cafe-rush': 'cafe-rush/CafeRushGame.js',
    'cafe-critters': 'cafe-critters/CafeCrittersGame.js',
    'coffee-crash': 'coffee-crash/CoffeeCrashGame.js',
    'cafe-drift': 'cafe-drift/CafeDriftGame.js',
};
const styles = {
    'open-world': [],
    'dino-run': ['phase5-step23-dino-run'],
    'after-hours': ['after-hours'],
    'cafe-rush': ['after-hours', 'cafe-rush'],
    'cafe-critters': ['after-hours', 'cafe-critters'],
    'coffee-crash': ['coffee-crash'],
    'cafe-drift': ['cafe-drift'],
};
assert.deepEqual(offline.games.map(x => x.id), OFFLINE_GAME_IDS);
for (const [id, name] of Object.entries(games)) {
    const row = vite['resources/js/game/games/' + name];
    assert.ok(row?.isDynamicEntry, 'Missing game chunk: ' + id);
    assert.ok(!eager.has('build/' + row.file), 'Eager game chunk: ' + id);
    assert.ok(graph.games[id].includes('build/' + row.file), 'Offline split misses ' + id);
    for (const [otherId, otherName] of Object.entries(games)) {
        if (otherId === id) continue;
        const other = vite['resources/js/game/games/' + otherName];
        assert.ok(!graph.games[id].includes('build/' + other.file),
            'One selected game downloads unrelated game chunk: ' + id + ' / ' + otherId);
    }
    const selected = offline.games.find(x => x.id === id);
    assert.ok(selected?.files.some(x => x.path === 'build/' + row.file),
        'Offline pack missing game: ' + id);
    for (const name of styles[id]) {
        const css = vite['resources/css/' + name + '.css'];
        assert.ok(css?.file, 'Missing dynamic stylesheet: ' + name);
        const path = 'build/' + css.file;
        assert.ok(!eager.has(path) && !graph.core.includes(path),
            'Game stylesheet leaked into initial/core graph: ' + name);
        assert.ok(graph.games[id].includes(path), 'Game offline graph misses style: ' + name);
        assert.ok(selected.files.some(asset => asset.path === path),
            'Offline release misses game stylesheet: ' + id + '/' + name);
    }
}
console.log('PASS: Seven selective game chunks, deferred PWA, and isolated offline game styles.');
