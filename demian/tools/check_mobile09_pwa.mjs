/** Mobile-09 real headless Chromium: selected pack, offline reload/play, cleanup.
 * Physical Android and iOS acceptance remains the Mobile-12 hardware gate.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
if (!existsSync(resolve(root, 'offline-packs.json'))) throw new Error('Build the static PWA first.');
const output = resolve(import.meta.dirname, '../docs/mobile-09/browser');
mkdirSync(output, { recursive: true });
const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2',
    '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
};
const prefix = '/relocated/demian/';
const server = createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        const path = decodeURIComponent(url.pathname);
        if (!path.startsWith(prefix) || path.split('/').includes('..') || path.includes('\\')) throw Error('Outside scope');
        const rel = path.slice(prefix.length) || 'index.html';
        const file = resolve(root, rel);
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', /service-worker\.js|\.html$|\.webmanifest$|offline-packs\.json$/.test(rel)
            ? 'no-cache' : 'public, max-age=3600');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
});
const report = { test: 'Mobile-09', headlessChromium: true, physicalDeviceVerified: false, status: 'pending', errors: [] };
let browser;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 },
        isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    const base = 'http://127.0.0.1:' + server.address().port + prefix;
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
        null, { timeout: 90000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller),
        null, { timeout: 25000 });
    const manifest = await (await page.request.get(base + 'offline-packs.json')).json();
    assert.equal(manifest.games.length, 6);
    assert.ok(manifest.coreBytes > 0 && manifest.maxPackBytes <= 96 * 1048576);
    assert.ok(manifest.games.every(game => game.totalBytes <= manifest.maxPackBytes));
    await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
    const download = page.locator('[data-offline-download="dino-run"]');
    await download.waitFor({ state: 'visible', timeout: 30000 });
    await download.click();
    await page.waitForFunction(() =>
        document.querySelector('[data-offline-game="dino-run"] small')?.textContent.includes('آمادهٔ اجرای آفلاین'),
        null, { timeout: 120000 });
    const saved = await page.evaluate(async () => {
        const keys = await caches.keys();
        return { keys, usages: keys.filter(name => name.startsWith('demian-core-v1-') ||
            name.startsWith('demian-game-v1-')) };
    });
    assert.equal(saved.usages.length, 2, JSON.stringify(saved));
    assert.equal(saved.keys.filter(name => name.startsWith('demian-offline-v1-')).length, 1);
    assert.ok(saved.keys.every(key => !key.includes('api')));
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
        null, { timeout: 90000 });
    assert.equal(await page.locator('h1').filter({ hasText: 'دمیان فعلاً آفلاین است' }).count(), 0);
    // Player explicitly requests a local practice round; no forged ranked POST.
    await page.evaluate(() => window.demianGameApplication.launchGame('dino-run', { seed: 127 }));
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'playing',
        null, { timeout: 60000 });
    report.offlineGameplay = 'passed';
    await context.setOffline(false);
    await page.evaluate(() => window.demianGameApplication.showMenu());
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
    await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
    const remove = page.locator('[data-offline-remove="dino-run"]');
    await remove.waitFor({ state: 'visible', timeout: 25000 });
    await remove.click();
    await page.waitForFunction(() =>
        document.querySelector('[data-offline-game="dino-run"] small')?.textContent.includes('دریافت نشده'),
        null, { timeout: 30000 });
    const keysAfter = await page.evaluate(() => caches.keys());
    assert.ok(keysAfter.every(key => !key.startsWith('demian-core-v1-') &&
        !key.startsWith('demian-game-v1-')), JSON.stringify(keysAfter));
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.match(await page.locator('h1').innerText(), /دمیان فعلاً آفلاین است/);
    assert.deepEqual(jsErrors, []);
    report.status = 'passed';
    report.offlineFallbackAfterDelete = 'passed';
    report.scope = prefix;
    report.cachedKeys = saved.keys;
    report.browser = browser.version();
    await context.close();
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'mobile-09-pwa.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('Mobile-09 offline PWA browser QA failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('Mobile-09 selective offline pack + real offline practice + cleanup: passed');
}
