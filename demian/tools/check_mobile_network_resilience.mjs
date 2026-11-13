/** Mobile-04 browser regression: an offline/data-saver phone must load a
 * playable foreground character without hydrating the optional NPC roster.
 * When the connection improves, background NPCs may resume without reload.
 */
import assert from 'node:assert/strict';
import { existsSync, createReadStream, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
const reportDir = resolve(import.meta.dirname, '../docs/mobile-04/browser');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Run npm run build:static first');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw new Error('unsafe path');
        const file = resolve(root, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('missing file');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch {
        res.writeHead(404); res.end();
    }
});
const listen = () => new Promise(done => server.listen(0, '127.0.0.1', done));
const close = () => new Promise(done => server.close(done));
const report = { status: 'pending', physicalPhoneMeasured: false, scenario: 'save-data-then-fast-network',
    errors: [], before: null, after: null };
let browser, context, page;
try {
    await listen();
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    context = await browser.newContext({ viewport: { width: 360, height: 740 },
        deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
        const connection = new EventTarget();
        connection.effectiveType = '2g';
        connection.saveData = true;
        Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
        window.__testConnection = connection;
    });
    page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 120000 });
    await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
    await page.waitForFunction(() =>
        window.demianGameApplication?.sessionState === 'playing' &&
        Boolean(window.demianGameApplication?.activeGame?.characterManager?.activeEntity),
    null, { timeout: 120000 });
    await page.waitForTimeout(800);
    report.before = await page.evaluate(() => {
        const manager = window.demianGameApplication.activeGame.characterManager;
        return { entities: manager.entities.size,
            activeSlug: manager.activeRecord?.slug,
            cache: window.demianGameApplication.characterVisuals.memorySnapshot() };
    });
    assert.equal(report.before.entities, 1, 'Save-Data must not hydrate optional NPCs before first play');
    assert.ok(report.before.activeSlug, 'critical active player must render on slow network');
    // Speed improves and Save-Data is disabled: resume optional streaming through
    // the live Network Information change event, without restarting the game.
    await page.evaluate(() => {
        window.__testConnection.saveData = false;
        window.__testConnection.effectiveType = '4g';
        window.__testConnection.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() =>
        window.demianGameApplication.activeGame.characterManager.entities.size > 1,
    null, { timeout: 90000 });
    report.after = await page.evaluate(() => {
        const manager = window.demianGameApplication.activeGame.characterManager;
        return { entities: manager.entities.size,
            cache: window.demianGameApplication.characterVisuals.memorySnapshot() };
    });
    assert.ok(report.after.entities > report.before.entities);
    assert.equal(report.errors.length, 0, 'no uncaught JavaScript errors');
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error?.stack ?? String(error));
} finally {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(resolve(reportDir, 'save-data-resume.json'), JSON.stringify(report, null, 2) + '\n');
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (server.listening) await close();
}
if (report.status !== 'passed') {
    console.error('Mobile-04 browser test failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Mobile-04] save-data critical start + background resume passed:', {
        before: report.before.entities, after: report.after.entities,
    });
}
