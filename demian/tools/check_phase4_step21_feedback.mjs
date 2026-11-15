import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase4-step21');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Static export is required');
mkdirSync(output, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw Error('invalid path');
        const file = resolve(root, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('not found');
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
});

const report = {
    schema: 1, status: 'pending', emulatedDevice: true, physicalDeviceVerified: false,
    frameSample: null, feedback: null, errors: [],
};
let browser;
try {
    await new Promise(ready => server.listen(0, '127.0.0.1', ready));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/', {
        waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.demianGameApplication.feedback.audio.context === null), true,
        'Audio may only initialize after a user gesture');

    await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
    await page.locator('[data-screen="game-selection"]').waitFor({ state: 'visible' });
    await page.locator('[data-game-launch="dino-run"]').click();
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'playing', null, { timeout: 40000 });
    const state = await page.evaluate(() => {
        const app = window.demianGameApplication;
        return { ...app.feedback.snapshot(),
            contextCreated: Boolean(app.feedback.audio.context),
            layerNoninteractive: getComputedStyle(document.querySelector('[data-game-feedback-host]')).pointerEvents === 'none' };
    });
    assert.equal(state.gameId, 'dino-run');
    assert.equal(state.contextCreated, true);
    assert.equal(state.layerNoninteractive, true);
    assert.ok(state.musicVoices <= 2 && state.audioVoices <= 4);

    report.frameSample = await page.evaluate(async () => {
        const app = window.demianGameApplication;
        const intervals = [];
        const begin = performance.now();
        let previous = begin;
        let lastCue = 0;
        await new Promise(resolve => {
            function frame(now) {
                intervals.push(now - previous);
                previous = now;
                if (now - lastCue >= 120) {
                    lastCue = now;
                    app.eventBus.emit('feedback:cue', { gameId: 'dino-run', kind: 'passed' });
                }
                if (now - begin >= 900) resolve();
                else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        });
        const measured = intervals.filter(ms => ms > 0).sort((a, b) => a - b);
        return {
            frames: intervals.length,
            durationMs: Math.round(performance.now() - begin),
            medianFrameMs: Math.round((measured[Math.floor(measured.length / 2)] ?? 0) * 100) / 100,
            maxFrameMs: Math.round(Math.max(...intervals, 0) * 100) / 100,
            maximumAllocatedParticles: app.feedback.visual.nodes.length,
            maximumAudioVoices: app.feedback.audio.voices.size,
        };
    });
    assert.ok(report.frameSample.frames >= 9, 'Frames must progress under bounded effects in emulated Chromium');
    assert.ok(report.frameSample.maximumAllocatedParticles <= 10);
    assert.ok(report.frameSample.maximumAudioVoices <= 4);

    await page.evaluate(() => window.demianGameApplication.settings.update({
        soundEnabled: false, musicEnabled: false,
    }));
    const muted = await page.evaluate(() => {
        const audio = window.demianGameApplication.feedback.audio;
        return [audio.voices.size, audio.musicNodes.length, audio.play('score')];
    });
    assert.deepEqual(muted, [0, 0, false], 'Both audio buses must honor user settings');

    await page.evaluate(() => window.demianGameApplication.settings.update({ motion: 'reduced' }));
    await page.evaluate(() => window.demianGameApplication.eventBus.emit('feedback:cue',
        { gameId: 'dino-run', kind: 'passed' }));
    assert.equal(await page.evaluate(() => window.demianGameApplication.feedback.visual.active.size), 0,
        'Reduced motion must disable decorative bursts');

    await page.evaluate(() => window.demianGameApplication.pauseGame());
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'paused');
    await page.evaluate(() => window.demianGameApplication.eventBus.emit('feedback:cue',
        { gameId: 'dino-run', kind: 'passed' }));
    assert.equal(await page.evaluate(() => window.demianGameApplication.feedback.visual.active.size), 0,
        'Paused games must not render gameplay feedback');

    await page.evaluate(() => window.demianGameApplication.showMenu());
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
    report.feedback = await page.evaluate(() => ({
        ...window.demianGameApplication.feedback.snapshot(),
        soundEnabled: window.demianGameApplication.settings.snapshot().soundEnabled,
    }));
    assert.equal(report.feedback.activeEffects, 0);
    assert.equal(report.feedback.musicVoices, 0);
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'audiovisual-browser.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 21] Browser feedback acceptance failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 21] Browser feedback acceptance passed:', report.frameSample);
}
