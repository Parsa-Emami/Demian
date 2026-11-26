import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import GameRegistry from '../../../resources/js/game/registry/GameRegistry.js';
import LoadingScreen from '../../../resources/js/game/shell/screens/LoadingScreen.js';

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

test('Fast loader uses a fixed-size RTL transform fill, faster bounded motion and a static spark', () => {
    assert.match(css, /--loading-orbit-duration: 1000ms/);
    assert.match(css, /--loading-beat-duration: 720ms/);
    assert.match(css, /--loading-fill-duration: 120ms/);
    const fill = css.match(/\.loading-experience \.shell-progress span \{([^}]+)\}/)[1];
    assert.match(fill, /width: 100%/);
    assert.match(fill, /transform: scaleX\(var\(--loading-progress-scale, 0\)\)/);
    assert.match(fill, /transform-origin: right center/);
    assert.match(fill, /transition: transform /);
    assert.doesNotMatch(fill, /transition: width/);
    assert.doesNotMatch(css, /demian-loader-spark/);
    assert.match(css, /data-motion="reduced"/);
    assert.match(css, /data-render-quality="economy"/);
    assert.match(css, /data-screen-state="leaving"/);
});

test('Real loader keeps progress, semantic stages, restart and timer cleanup synchronized', async () => {
    const nodes = new Map();
    const makeNode = () => ({
        textContent: '', attributes: new Map(), properties: new Map(), dataset: {},
        setAttribute(key, value) { this.attributes.set(key, value); },
        addEventListener() {}, removeEventListener() {},
    });
    for (const selector of ['title', 'step', 'progress-bar', 'progress-value', 'phase',
        'elapsed', 'health', 'tip-text', 'tip-next']) {
        const node = makeNode();
        node.style = { setProperty: (key, value) => node.properties.set(key, value) };
        nodes.set('[data-loading-' + selector + ']', node);
    }
    let cancelled = 0;
    const element = {dataset: {},
        querySelector: selector => nodes.get(selector) ?? null,
        getAnimations: () => [{ cancel() { cancelled++; } }],
    };
    const screen = new LoadingScreen({id:'loading', element});
    const bar = nodes.get('[data-loading-progress-bar]');
    try {
        await screen.beforeOpen({gameId:'dino-run', progress:0});
        for (const progress of [0, 25, 50, 75, 100]) {
            screen.setProgress(progress, 'stage');
            assert.equal(bar.properties.get('--loading-progress-scale'), String(progress / 100));
            assert.equal(bar.properties.get('--loading-progress'), progress + '%');
            assert.equal(bar.attributes.get('aria-valuenow'), String(progress));
            assert.equal(screen.stage, progress / 25);
        }
        screen.setProgress(999);
        assert.equal(bar.properties.get('--loading-progress-scale'), '1');
        screen.setProgress(-30);
        assert.equal(bar.properties.get('--loading-progress-scale'), '0');
        await screen.afterOpen();
        assert.notEqual(screen.timer, null);
        await screen.beforeClose();
        assert.equal(screen.timer, null);
        await screen.afterClose();
        assert.equal(cancelled, 1, 'finished screen transitions must release their fill-mode animations');
        screen.setProgress(100);
        await screen.beforeOpen({gameId:'open-world', progress:0});
        assert.equal(screen.stage, 0);
        assert.equal(bar.properties.get('--loading-progress-scale'), '0');
        assert.equal(bar.attributes.get('aria-valuenow'), '0');
        const firstTip = screen.tipText.textContent;
        screen.nextTip();
        assert.notEqual(screen.tipText.textContent, firstTip);
    } finally { screen.dispose(); }
    assert.equal(screen.timer, null);
    assert.equal(cancelled, 2, 'dispose must also cancel any retained loading animations');
});
