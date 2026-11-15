import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase6-step30');
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(root, 'build/manifest.json'), 'utf8'));
const entry = manifest['resources/js/app.js'];
if (!entry?.file) throw Error('Run npm run build:static before performance QA');
const compressedJsBytes = gzipSync(readFileSync(resolve(root, 'build', entry.file))).byteLength;
const report = {
    schema: 1, status: 'pending', compressedJsBytes, prepaint: null,
    firstReadyMs: null, cold4g: null, games: [], errors: [],
    emulatedNetwork: true, physicalPhoneVerified: false, liveHostPerformanceVerified: false,
    limitations: [
        'Chromium CPU and network emulation is lab evidence only, not device or global CDN SLO.',
        'The first prepaint test deliberately delays the atomic JS bundle by 2.4 seconds.',
        'No production API or 50-user hosted concurrency is exercised by this browser test.',
    ],
};
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw Error('Invalid path');
        const file = resolve(root, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not a static release file');
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
});
const wait = (page, check, timeout = 15000) => page.waitForFunction(check, null, { timeout });
let browser;
try {
    assert.ok(compressedJsBytes < 400 * 1024,
        'Atomic entry exceeds hard 400 KiB compressed payload ceiling. Reduce unused code before merging.');
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const origin = 'http://127.0.0.1:' + server.address().port;
    // TEST A: a real user sees a navigable menu while the very large JS
    // module is still downloading; an early click is delivered exactly once.
    {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 }, isMobile: true,
            hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            page.on('pageerror', error => report.errors.push(error.message));
            await page.route(/\/build\/assets\/app-[^/]+\.js/, async route => {
                await new Promise(done => setTimeout(done, 2400));
                await route.continue();
            });
            const started = Date.now();
            await page.goto(origin + '/', { waitUntil: 'commit', timeout: 30000 });
            await wait(page, () => document.querySelector('[data-character-manager]')?.dataset.instantMenu === 'true'
                && document.querySelector('[data-screen="cafe-menu"]')?.hidden === false, 2000);
            const visibleMs = Date.now() - started;
            assert.ok(visibleMs < 2000, 'Static menu did not paint before the delayed JS: ' + visibleMs);
            assert.equal(await page.evaluate(() => Boolean(window.demianGameApplication)), false);
            await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
            assert.equal(await page.evaluate(() =>
                document.querySelector('[data-character-manager]').dataset.pendingMenuAction), 'play');
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu'
                && document.querySelector('[data-screen="game-selection"]')?.hidden === false, 20000);
            const readyMs = Date.now() - started;
            assert.equal(await page.locator('[data-game-card]').count(), 6);
            assert.equal(await page.evaluate(() =>
                document.querySelector('[data-character-manager]').dataset.pendingMenuAction ?? null), null);
            assert.equal(await page.evaluate(() =>
                document.querySelector('[data-character-manager]').dataset.instantMenu ?? null), null);
            assert.equal(await page.locator('[data-instant-menu-status]').count(), 0);
            report.prepaint = { visibleMs, deferredScriptMs: 2400, earlyClickReplayed: true,
                menuVisibleBeforeEngine: true, sixCards: true, fullHydrationMs: readyMs };
            assert.deepEqual(report.errors, []);
        } finally { await context.close(); }
    }

    // TEST B: emulated cold 4G / CPU x2. Assert the user's requested latency
    // ceilings for JS hydration and first-playable state of all six games.
    {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true, serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            page.on('pageerror', error => report.errors.push(error.message));
            const cdp = await context.newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', {
                offline: false, latency: 80, downloadThroughput: 8 * 1024 * 1024 / 8,
                uploadThroughput: 2 * 1024 * 1024 / 8,
            });
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
            const started = Date.now();
            await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 15000);
            const bootMs = Date.now() - started;
            assert.ok(bootMs < 5000, 'Cold 4G menu hydration exceeds 5s: ' + bootMs);
            report.firstReadyMs = bootMs;
            await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
            await wait(page, () => !document.querySelector('[data-screen="game-selection"]')?.hidden);
            for (const game of ['coffee-crash', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'open-world']) {
                const start = Date.now();
                await page.evaluate(id => window.demianGameApplication.launchGame(id), game);
                await wait(page, () => window.demianGameApplication.sessionState === 'playing', 15000);
                const ms = Date.now() - start;
                report.games.push({ game, firstPlayMs: ms, status: 'passed' });
                assert.ok(ms < 7000, 'Cold 4G first gameplay >7 seconds: ' + game + ' / ' + ms);
                await page.evaluate(() => window.demianGameApplication.showMenu());
                await wait(page, () => window.demianGameApplication.sessionState === 'menu');
            }
            report.cold4g = { latencyMs: 80, downMbps: 8, cpuSlowdown: 2, initialMenuMs: bootMs };
            assert.deepEqual(report.errors, [], 'No runtime exceptions in cold 4G test');
        } finally { await context.close(); }
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'startup.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(done => server.close(done));
}
if (report.status !== 'passed') {
    console.error('[Step 30] Startup regression:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 30] Fast startup, cold 4G and six games passed:', {
        prepaint: report.prepaint, cold4g: report.cold4g,
        games: report.games, compressedJsBytes,
    });
}
