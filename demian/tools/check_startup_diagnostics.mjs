/**
 * Phase 1 performance diagnosis: an opt-in real browser lab (not physical
 * phone evidence). Verify cold/warm game metrics, PWA registration and local
 * JSON privacy before any optimization changes are considered.
 */
import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/performance-diagnosis');
mkdirSync(output, { recursive: true });
const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('Invalid path');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Missing file');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control',
            /\.(?:js|css|webp|woff2)$/.test(pathname) ? 'public, max-age=31536000, immutable'
                : 'no-cache, max-age=0, must-revalidate');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
});
const games = ['coffee-crash', ...GAME_CATALOG.map(game => game.id).filter(id => id !== 'coffee-crash')];
const report = {
    schema: 1, status: 'pending', physicalPhoneVerified: false, liveHostVerified: false,
    evidence: 'headless Chromium; emulated 4G/CPU and installed-service-worker browser path',
    cold: null, warm: null, pwa: null, gameRuns: [], cdptiming: null,
    browserSmoke: [], errors: [], limitations: [
        'Emulated mobile viewports, network and CPU are not actual Android/iOS hardware.',
        'Browser performance entries do not isolate JS parse/evaluate; CDP V8CompileDuration is Chromium-only.',
        'PWA control is measured in headless Chrome with a service worker, not verified installed phone display mode.',
        'Cold/warm are controlled by browser contexts, not by a user-managed production device cache.',
    ],
};
let browser;
try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const { chromium, firefox, webkit } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    const origin = 'http://127.0.0.1:' + server.address().port + '/';
    browser = await chromium.launch({ headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true,
        hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true,
    });
    try {
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push('chromium: ' + error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        await cdp.send('Network.enable');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
        await cdp.send('Network.emulateNetworkConditions', {
            offline: false, latency: 80, downloadThroughput: 8 * 1024 * 1024 / 8,
            uploadThroughput: 2 * 1024 * 1024 / 8, connectionType: 'cellular4g',
        });
        const before = nodePerformance.now();
        await page.goto(origin + '?startupQa=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
            null, { timeout: 90000 });
        const elapsed = nodePerformance.now() - before;
        const cold = await page.evaluate(() => window.demianGameApplication?.startupDiagnostics?.report());
        assert.ok(cold && cold.schemaVersion === 1 && cold.page.menuReadyAtMs > 0);
        assert.ok(cold.network.capturedResources > 0);
        assert.equal(cold.physicalPhoneVerified, false);
        assert.equal(cold.page.javascriptParseEvaluateMs, null);
        report.cold = { elapsedMs: Math.round(elapsed), ...cold };
        const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(
            row => [row.name, row.value]));
        report.cdptiming = {
            scriptDurationMs: metrics.ScriptDuration === undefined ? null : +(metrics.ScriptDuration * 1000).toFixed(2),
            v8CompileDurationMs: metrics.V8CompileDuration === undefined ? null : +(metrics.V8CompileDuration * 1000).toFixed(2),
            taskDurationMs: metrics.TaskDuration === undefined ? null : +(metrics.TaskDuration * 1000).toFixed(2),
            jsHeapUsedBytes: metrics.JSHeapUsedSize ?? null,
        };
        for (const id of games) {
            await page.evaluate(async gameId => window.demianGameApplication.launchGame(gameId), id);
            await page.waitForFunction(gameId => {
                const app = window.demianGameApplication;
                return app?.sessionState === 'playing' && app.activeGameId === gameId;
            }, id, { timeout: 60000 });
            await page.waitForFunction(gameId => {
                const rows = window.demianGameApplication?.startupDiagnostics?.report().gameStarts;
                return rows?.some(row => row.game === gameId && row.firstRenderAfterSessionMs !== null);
            }, id, { timeout: 20000 });
            const measured = await page.evaluate(() =>
                window.demianGameApplication.startupDiagnostics.report().gameStarts.at(-1));
            assert.equal(measured.game, id);
            assert.ok(measured.moduleMs >= 0 && measured.assetsMs >= 0 &&
                measured.sceneMs >= 0 && measured.sessionMs >= 0);
            assert.ok(measured.firstRenderAfterSessionMs >= 0);
            assert.equal(measured.status, 'playing');
            report.gameRuns.push(measured);
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        }
        await page.locator('[data-startup-diagnostics] summary').click();
        const downloaded = page.waitForEvent('download', { timeout: 15000 });
        await page.locator('[data-startup-download]').click();
        const file = await downloaded;
        const localJson = JSON.parse(readFileSync(await file.path(), 'utf8'));
        assert.equal(localJson.gameStarts.length, games.length);
        assert.equal(localJson.privacy.startsWith('local-only'), true);
        assert.ok(!JSON.stringify(localJson).includes(origin));
        assert.ok(!Object.hasOwn(localJson, 'userAgent'));
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
            null, { timeout: 90000 });
        await page.waitForFunction(() => navigator.serviceWorker?.controller !== null,
            null, { timeout: 30000 });
        report.warm = await page.evaluate(() => window.demianGameApplication.startupDiagnostics.report());
        assert.equal(report.warm.page.navigation?.type, 'reload');
        report.pwa = {
            browserControlled: report.warm.environment.serviceWorkerControlled,
            standalonePwa: report.warm.environment.standalonePwa,
            note: 'Headless service-worker control only; no installed phone UI verified.',
        };
        assert.equal(report.pwa.browserControlled, true);
    } finally {
        await context.close();
    }
    await browser.close();
    browser = null;
    for (const [name, engine] of [['firefox', firefox], ['webkit', webkit]]) {
        const instance = await engine.launch({ headless: true });
        try {
            const context = await instance.newContext({
                viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
                serviceWorkers: 'block',
            });
            try {
                const page = await context.newPage();
                page.on('pageerror', error => report.errors.push(name + ': ' + error.message));
                await page.goto(origin + '?startupQa=1', {
                    waitUntil: 'domcontentloaded', timeout: 60000,
                });
                await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
                    null, { timeout: 45000 });
                const metrics = await page.evaluate(() =>
                    window.demianGameApplication.startupDiagnostics.report());
                assert.equal(metrics.schemaVersion, 1);
                assert.equal(metrics.physicalPhoneVerified, false);
                assert.ok(metrics.page.menuReadyAtMs > 0);
                report.browserSmoke.push({ browser: name, status: 'passed',
                    hasLcp: metrics.page.paint.largestContentfulPaintMs !== null });
            } finally { await context.close(); }
        } finally { await instance.close(); }
    }
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
    console.log('Startup diagnosis cold/warm, full catalog, PWA + browser sanity: PASSED');
} catch (error) {
    report.status = 'failed';
    report.failure = error.stack || String(error);
    console.error(report.failure);
    throw error;
} finally {
    writeFileSync(resolve(output, 'browser-diagnosis.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    await new Promise(done => server.close(done));
}
