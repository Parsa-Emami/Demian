import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const release = resolve(import.meta.dirname, '../_site');
const mime = new Map([
    ['.js', 'text/javascript'], ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css'], ['.json', 'application/json'], ['.png', 'image/png'],
    ['.woff2', 'font/woff2'], ['.webmanifest', 'application/manifest+json'],
]);
const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/Demian/')) return response.writeHead(404).end();
    const file = resolve(release, pathname.slice('/Demian/'.length) || 'index.html');
    try {
        if (!file.startsWith(release + sep) || !statSync(file).isFile()) return response.writeHead(404).end();
        response.setHeader('Content-Type', mime.get(extname(file)) ?? 'application/octet-stream');
        createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
        response.writeHead(404).end();
    }
});
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const scope = origin + '/Demian/';
const key = createECDH('prime256v1').generateKeys().toString('base64url');
const browser = await chromium.launch({ headless: true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    await context.grantPermissions(['notifications'], { origin });
    await context.addInitScript(() => {
        let current;
        window.pushSubscriptions = 0;
        Object.defineProperty(Notification, 'permission', { configurable: true, value: 'granted' });
        PushManager.prototype.getSubscription = async () => current ?? null;
        PushManager.prototype.subscribe = async ({ userVisibleOnly, applicationServerKey }) => {
            if (!userVisibleOnly || applicationServerKey.length !== 65) throw Error('Unexpected browser options');
            window.pushSubscriptions += 1;
            current = {
                options: { applicationServerKey },
                endpoint: 'https://fcm.googleapis.com/wp/test-device',
                toJSON: () => ({ endpoint: current.endpoint, keys: { p256dh: 'test-key', auth: 'test-auth' } }),
                unsubscribe: async () => { current = null; return true; },
            };
            return current;
        };
    });
    const page = await context.newPage();
    await page.goto(scope, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.demianGameApplication));
    const actualScope = await page.evaluate(() => navigator.serviceWorker.ready.then(worker => worker.scope));
    assert.equal(actualScope, scope);
    await page.evaluate(key => {
        const service = window.demianGameApplication.leaderboards;
        service.baseUrl = 'https://api.example.test/api/v1/arcade';
        service.identity = { player_id: 'test-player', token: 'X'.repeat(64) };
        window.pushRequests = [];
        service.request = async (path, options) => {
            if (path === '/push/config') return { enabled: true, public_key: key };
            if (path === '/player/push/subscription') window.pushRequests.push(options);
            return {};
        };
    }, key);
    await page.locator('[data-screen="cafe-menu"] [data-shell-action="settings"]').click();
    const enable = page.locator('[data-browser-push-enable]');
    await enable.waitFor({ state: 'visible', timeout: 6000 }).catch(async error => {
        const status = await page.locator('[data-browser-push-status]').textContent();
        throw new Error('Push settings did not become available: '+status, { cause: error });
    });
    assert.equal(await page.evaluate(() => window.pushSubscriptions), 0);
    await enable.click();
    await page.waitForFunction(() => window.pushRequests.length === 1);
    const disable = page.locator('[data-browser-push-disable]');
    await disable.waitFor({ state: 'visible' });
    await disable.click();
    await page.waitForFunction(() => window.pushRequests.length === 2);
    const requests = await page.evaluate(() => window.pushRequests);
    assert.deepEqual(requests.map(({ method, authenticated }) => [method, authenticated]), [['POST', true], ['DELETE', true]]);
    const landing = await context.newPage();
    await landing.goto(scope + '#demian-notice=rewards', { waitUntil: 'domcontentloaded' });
    await landing.locator('[data-screen="coupon-wallet"]').waitFor({ state: 'visible' });
    assert.equal(new URL(landing.url()).hash, '');
    console.log('Browser push controls and notification deep link passed on a 390px emulated Chromium PWA.');
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
