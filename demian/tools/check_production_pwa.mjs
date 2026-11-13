/** Mobile-07: real Chromium regression for portable fonts, PWA and offline page.
 * Runs against the optimized _site release under / and /relocated/demian/.
 * Does not certify Safari, physical device, or an actual hosting provider.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/mobile-07/browser');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Build _site before PWA QA');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        const path = decodeURIComponent(url.pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw new Error('invalid');
        const rel = path.startsWith('/relocated/demian/')
            ? path.slice('/relocated/demian/'.length) : path.replace(/^\/+/, '');
        const target = resolve(root, rel || 'index.html');
        if (!target.startsWith(root + sep) || !statSync(target).isFile()) throw new Error('not found');
        res.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
        // Mimic a conservative production server: fresh shell; immutable fonts.
        res.setHeader('Cache-Control', /\.html$|service-worker\.js$|webmanifest$/.test(target)
            ? 'no-cache' : 'public, max-age=3600');
        createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch {
        res.writeHead(404); res.end('not found');
    }
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = () => new Promise(resolve => server.close(resolve));
const report = { status: 'pending', simulated: true, physicalDeviceVerified: false,
    browser: null, profiles: [], errors: [], caveats: [
        'This is headless Chromium emulation, not a physical Android or iOS device.',
        'Offline PWA shows a helpful fallback; it does not claim to run or submit ranked scores offline.',
        'GitHub Pages ignores .htaccess. Shared Apache/LiteSpeed hosts must be verified independently.',
    ] };
mkdirSync(output, { recursive: true });
let browser;
try {
    await listen();
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    report.browser = browser.version();
    for (const path of ['/', '/relocated/demian/']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 },
            hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const failures = [], fontResponses = [];
        try {
            page.on('pageerror', error => failures.push(error.message));
            page.on('response', response => {
                if (/\.woff2(?:\?|$)/.test(response.url())) {
                    fontResponses.push({ url: response.url(), status: response.status() });
                }
            });
            const base = `http://127.0.0.1:${server.address().port}${path}`;
            await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
                null, { timeout: 120000 });
            const fonts = await page.evaluate(async () => {
                for (const weight of [400, 700, 900]) {
                    await document.fonts.load(`${weight} 20px Vazirmatn`, 'دمیان Parsa');
                }
                return { loaded: document.fonts.check('900 20px Vazirmatn', 'دمیان'),
                    family: getComputedStyle(document.body).fontFamily };
            });
            assert.equal(fonts.loaded, true, 'Vazirmatn Arabic font failed to load');
            assert.ok(fontResponses.length >= 6, 'all local Arabic and Latin font variants must load');
            assert.ok(fontResponses.every(row => row.status === 200), JSON.stringify(fontResponses));
            for (const row of fontResponses) {
                const pathname = new URL(row.url).pathname;
                assert.ok(pathname.startsWith(path + 'build/assets/'),
                    'root-relative font escaped deployment scope: ' + pathname);
            }
            await page.waitForFunction(async () => {
                const registration = await navigator.serviceWorker?.getRegistration();
                return Boolean(registration?.active && navigator.serviceWorker.controller);
            }, null, { timeout: 20000 });
            const cache = await page.evaluate(async () => {
                const keys = (await caches.keys()).filter(k => k.startsWith('demian-offline-v1-'));
                const entries = [];
                for (const name of keys) {
                    const cached = await caches.open(name);
                    entries.push(...(await cached.keys()).map(request => new URL(request.url).pathname));
                }
                return { names: keys, entries };
            });
            assert.equal(cache.names.length, 1, 'one release cache per installation scope');
            assert.ok(cache.entries.some(item => item.endsWith('/offline.html')));
            assert.ok(cache.entries.every(item => !/\/api\/|\/build\/|\/assets\/characters\//.test(item)),
                'PWA must not cache auth/score endpoints or release-critical game assets');
            await context.setOffline(true);
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
            assert.match(await page.locator('h1').innerText(), /دمیان فعلاً آفلاین است/);
            assert.match(await page.locator('main').innerText(), /هیچ امتیازی/);
            await context.setOffline(false);
            await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
                null, { timeout: 120000 });
            assert.deepEqual(failures, []);
            report.profiles.push({ path, status: 'passed', fontResponses: fontResponses.length,
                fonts, cache, offlineFallback: 'passed', reconnect: 'passed', pageErrors: failures });
        } finally {
            await context.close();
        }
    }
    report.status = 'passed';
} catch (error) {
    report.errors.push(error.stack ?? String(error));
    report.status = 'failed';
} finally {
    writeFileSync(resolve(output, 'pwa-and-fonts.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    if (server.listening) await close();
}
if (report.status !== 'passed') {
    console.error('[Mobile-07] PWA / fonts browser QA failed:', report.errors);
    process.exitCode = 1;
} else console.log('[Mobile-07] PWA + portable fonts passed:', report.profiles.map(p => p.path));
