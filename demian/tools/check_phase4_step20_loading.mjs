/**
 * Phase 4 / Step 20 — actual built-release startup acceptance.
 *
 * CI-run Chromium is intentionally not a physical Android or iOS device.
 * No network is required to render the initial menu. Games and their optional
 * images load only on explicit selection; switching games cannot strand a
 * blocking loading screen or make a sprite/texture mandatory for the menu.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase4-step20');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build the static release first');
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw Error('invalid path');
        const file = resolve(root, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=0');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
});
const wait = (page, predicate, timeout = 45000) => page.waitForFunction(predicate, null, { timeout });
const report = {
    schema: 1, status: 'pending', physicalDeviceVerified: false,
    firstMenuMs: null, firstMenuAssetRequests: [], games: [], errors: [],
    limitations: [
        'Chromium emulation does not measure physical iOS Safari or Android Chrome startup.',
        'On-device GPU memory, PSS/RSS, energy, 15-minute thermal conditions and touch-to-photon remain external gates.',
        'Offline game packs and PWA updates are checked by Mobile-07/09 suites, not inferred from this test.',
    ],
};
let browser, context, page;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    context = await browser.newContext({ viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    // Even a completely broken character endpoint and absent sprite server
    // must not prevent the initial menu from becoming interactive.
    let menuPhase = true;
    await page.route(/\/(?:characters\.json|assets\/characters\/[^/]+\/[^/?]+(?:spritesheet|atlas)[^/?]*)/, async route => {
        if (menuPhase) {
            report.firstMenuAssetRequests.push(new URL(route.request().url()).pathname);
            await route.abort();
        } else await route.continue();
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const startedAt = Date.now();
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 20000);
    report.firstMenuMs = Date.now() - startedAt;
    menuPhase = false;
    assert.equal(report.firstMenuAssetRequests.length, 0,
        'The first menu must not request character sheets or API before selection.');
    assert.ok(report.firstMenuMs <= 12000,
        'Built-release initial menu exceeded 12s local Chromium budget: ' + report.firstMenuMs);
    assert.equal(await page.evaluate(() => window.demianGameApplication?.activeGameId), null,
        'A full Open World instance must not be created as a menu backdrop.');

    const games = ['coffee-crash', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'open-world'];
    // The image loader's optional café preview takes up to 12s on failure.
    // Delay it in the first game to verify gameplay does not await that art.
    await page.route(/\/assets\/environments\/demian-fbx\/polished-v1\/preview\.webp/, async route => {
        await new Promise(resolve => setTimeout(resolve, 7000));
        try { await route.continue(); } catch { /* navigation canceled optional art */ }
    });
    for (const game of games) {
        const start = Date.now();
        // Directly await the same public method the game launcher invokes.
        await page.evaluate(id => window.demianGameApplication.launchGame(id), game);
        await wait(page, () => window.demianGameApplication?.sessionState === 'playing');
        const elapsed = Date.now() - start;
        report.games.push({ game, firstLaunchMs: elapsed, status: 'passed' });
        if (game === 'coffee-crash') {
            assert.ok(elapsed < 6500,
                'Coffee Crash start still blocks on the deliberately delayed 7s decorative art: ' + elapsed);
        }
        assert.ok(elapsed < 45000, 'Individual game stuck in loading: ' + game + ' (' + elapsed + 'ms)');
        await page.evaluate(() => window.demianGameApplication.showMenu());
        await wait(page, () => window.demianGameApplication?.sessionState === 'menu');
        assert.equal(await page.evaluate(() => window.demianGameApplication?.activeGameId), null,
            'Game assets must be released before returning to the menu.');
    }
    assert.deepEqual(report.errors, [], 'No uncaught errors in full boot/game/menu cycle.');
    report.status = 'passed';
} catch (error) {
    report.errors.push(error.stack ?? String(error));
    report.status = 'failed';
} finally {
    writeFileSync(resolve(output, 'startup-and-game-loading.json'), JSON.stringify(report, null, 2) + '\n');
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 20] Initial menu / all-games startup QA failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 20] Fast startup passed:', {
        firstMenuMs: report.firstMenuMs, games: report.games,
    });
}
