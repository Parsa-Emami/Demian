import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import GameRegistry from '../../../resources/js/game/registry/GameRegistry.js';

const source = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const app = source('../../../resources/js/game/application/GameApplication.js');
const loader = source('../../../resources/js/game/shell/screens/LoadingScreen.js');
const selection = source('../../../resources/js/game/shell/screens/GameSelectionScreen.js');
const view = source('../../../resources/views/demian.blade.php');
const css = source('../../../resources/css/experience-motion.css');

test('Loading stages track completed game work, not synthetic bytes or a ticking percentage', () => {
    assert.match(app, /gameId,\s*progress: 25, step: 'ماژول بازی دریافت شد'/);
    assert.match(app, /gameId,\s*progress: 50, step: 'منابع ضروری آماده شدند'/);
    assert.match(app, /gameId,\s*progress: 75, step: 'صحنه آماده است/);
    assert.match(app, /await this\.beginGameSession\(params\);\s*this\.eventBus\.emit\('game:loading-step', \{\s*gameId,\s*progress: 100/);
    assert.match(loader, /completed = Math\.min\(4, Math\.floor\(safe \/ 25\)\)/);
    assert.doesNotMatch(loader, /setInterval\(\(\) => this\.setProgress/);
    assert.match(loader, /globalThis\.setInterval\(\(\) => this\.updateElapsed\(\), 1000\)/);
    assert.match(loader, /this\.clearTimer\(\)/);
    assert.match(view, /data-loading-tip-next/);
    assert.match(view, /data-loading-phase/);
    assert.match(view, /data-loading-health/);
    assert.match(view, /data-loading-elapsed/);
    assert.match(view, /aria-valuetext="۰ از ۴ مرحله انجام شد"/);
});

test('Intent-based module warmup is capped; the registry caches modules, not game instances', async () => {
    let loaded = 0;
    let created = 0;
    class ExampleGame {
        constructor() { created++; }
        preload() {}
        enter() {}
        startSession() {}
        applySettings() {}
        fixedUpdate() {}
        update() {}
        render() {}
        pause() {}
        resume() {}
        exit() {}
        dispose() {}
    }
    const registry = new GameRegistry({
        demo: { title: 'demo', loader: async () => { loaded++; return { default: ExampleGame }; } },
    });
    await Promise.all([registry.load('demo'), registry.load('demo')]);
    assert.equal(loaded, 1);
    assert.equal(created, 0);
    await registry.create('demo');
    await registry.create('demo');
    assert.equal(loaded, 1);
    assert.equal(created, 2);
    assert.match(selection, /prefetched\.size >= 2/);
    assert.match(selection, /event\.pointerType === 'touch'/);
    assert.match(selection, /optionalAssetPolicy\(\)\.reason !== 'normal'/);
    assert.match(selection, /this\.registry\.load\(gameId\)/);
});

test('Motion UI uses GPU-safe animated transforms and respects reduced-motion and hidden screens', () => {
    assert.match(css, /loading-experience__orb/);
    assert.match(css, /@keyframes demian-loader-orbit/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(max-height: 540px\) and \(orientation: landscape\)/);
    assert.match(css, /\.shell-screen--loading/);
    assert.doesNotMatch(css, /backdrop-filter: blur\(2[0-9]px\)/);
    const layer = source('../../../resources/css/phase4-step20-ux.css');
    assert.match(layer, /\.shell-screen\[hidden\]/);
    const entry = source('../../../resources/js/app.js');
    assert.match(entry, /import '\.\.\/css\/experience-motion\.css'/);
});

test('No extra external font, image package, telemetry or scores are needed for UI motion', () => {
    assert.doesNotMatch(css, /url\(|@import|@font-face/);
    assert.doesNotMatch(loader, /fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
    assert.doesNotMatch(selection, /localStorage|sessionStorage/);
    assert.doesNotMatch(app.slice(app.indexOf('    launchGame(gameId'), app.indexOf('    async beginGameSession')), /sendBeacon|telemetry\.emit/);
});
