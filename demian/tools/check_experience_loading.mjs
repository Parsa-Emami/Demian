import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/experience-motion');
mkdirSync(output, { recursive: true });
const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('unsafe');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('missing');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
});

const report = {
    schema: 1, status: 'pending', entries: [], failures: [],
    physicalPhonesVerified: false, realHostingVerified: false, threeSecondGlobalGuarantee: false,
    notes: 'Source CI uses loopback hosting and Chromium emulated devices only.',
};
let browser;
try {
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const origin = 'http://127.0.0.1:' + server.address().port + '/';
    for (const device of [
        { name: 'compact-320', width: 320, height: 568 },
        { name: 'mobile-390', width: 390, height: 844 },
        { name: 'landscape-844', width: 844, height: 390 },
    ]) {
        const context = await browser.newContext({
            viewport: { width: device.width, height: device.height },
            isMobile: true, hasTouch: true, deviceScaleFactor: 2,
            serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
                null, { timeout: 35000 });
            await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
            await page.waitForFunction(() =>
                document.querySelector('[data-screen="game-selection"]')?.hidden === false);
            const cards = page.locator('[data-game-card]');
            assert.equal(await cards.count(), GAME_CATALOG.length);
            const gameAction = page.locator('[data-game-card="dino-run"] [data-game-launch]');
            await gameAction.scrollIntoViewIfNeeded();

            await page.evaluate(() => {
                const registry = window.demianGameApplication.registry;
                const real = registry.create.bind(registry);
                registry.create = async (...args) => {
                    await new Promise(done => setTimeout(done, 1500));
                    return real(...args);
                };
            });
            await gameAction.click();
            const loader = page.locator('[data-screen="loading"]');
            await loader.waitFor({ state: 'visible', timeout: 6000 });
            const progress = loader.locator('[data-loading-progress-bar]');
            assert.equal(await progress.getAttribute('aria-valuenow'), '0',
                'Percent must not advance before a real module load completes');
            const before = await loader.locator('[data-loading-tip-text]').innerText();
            await loader.locator('[data-loading-tip-next]').click();
            const after = await loader.locator('[data-loading-tip-text]').innerText();
            assert.notEqual(before, after, 'Loader should remain interactive while work is pending');
            await page.waitForTimeout(1100);
            assert.equal(await progress.getAttribute('aria-valuenow'), '0',
                'No invented mid-download progress should occur during delayed import');
            const elapsed = await loader.locator('[data-loading-elapsed]').innerText();
            assert.ok(/[۱-۹1-9]/.test(elapsed), 'Actual elapsed seconds should update');
            const rect = await loader.evaluate(element => {
                const panel = element.querySelector('.loading-experience').getBoundingClientRect();
                const screen = element.getBoundingClientRect();
                return { x: panel.x, y: panel.y, width: panel.width, height: panel.height,
                    centerX: Math.abs(panel.x + panel.width / 2 - screen.x - screen.width / 2),
                    centerY: Math.abs(panel.y + panel.height / 2 - screen.y - screen.height / 2),
                    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth };
            });
            assert.ok(rect.centerX < 8 && rect.centerY < 8, 'Loading panel must be centered: ' + JSON.stringify(rect));
            assert.ok(rect.documentWidth <= device.width + 2);
            assert.ok(rect.x >= 0 && rect.x + rect.width <= device.width + 2);
            await page.screenshot({ path: resolve(output, device.name + '-loading.png') });

            await page.waitForFunction(() =>
                window.demianGameApplication?.sessionState === 'playing',
                null, { timeout: 22000 });
            assert.equal(await loader.isVisible(), false, 'Loading must disappear after startSession');
            assert.deepEqual(errors, [], 'Browser exceptions during new loader flow');
            report.entries.push({ ...device, result: 'passed', rect, interactiveTip: true,
                elapsed, honestProgress: true, errors });
        } finally { await context.close(); }
    }

    const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    try {
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        const styles = await page.evaluate(() => {
            const el = document.querySelector('.loading-experience__orb-ring');
            return getComputedStyle(el).animationName;
        });
        assert.equal(styles, 'none', 'prefers-reduced-motion must disable decorative orbit');
    } finally { await context.close(); }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.failures.push(String(error.stack ?? error));
    process.exitCode = 1;
} finally {
    writeFileSync(resolve(output, 'loading-qa.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose));
    console.log(JSON.stringify(report, null, 2));
}
