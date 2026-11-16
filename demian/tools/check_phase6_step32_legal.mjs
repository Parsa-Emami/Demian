/** Phase 6 / Step 32: real-browser legal page and mobile routing acceptance. */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../_site');
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1');
        const decoded = decodeURIComponent(url.pathname);
        if (decoded.includes('\\') || decoded.split('/').includes('..')) throw Error('Unsafe path');
        const relative = decoded.replace(/^\/+/, '') || 'index.html';
        const file = resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Missing asset');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

let browser;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    try {
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        const footer = page.locator('nav.demian-legal-links');
        assert.equal(await footer.locator('a').count(), 3, 'All three legal links must exist on menu');
        for (const [slug, heading] of [
            ['privacy', 'سیاست حریم خصوصی'],
            ['terms', 'شرایط استفاده'],
            ['competition-rules', 'قوانین رقابت هفتگی و جوایز'],
        ]) {
            const response = await page.goto(origin + '/' + slug + '/', { waitUntil: 'load' });
            assert.equal(response.status(), 200, slug + ' page must be accessible');
            assert.equal(await page.locator('h1').innerText(), heading);
            assert.equal(await page.locator('html').getAttribute('lang'), 'fa');
            assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
            assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),
                'noindex,nofollow', 'Unreviewed policy must be unindexed');
            assert.equal(await page.locator('nav a').count(), 4);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                true, slug + ' must not horizontally overflow on 390px mobile');
        }
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        await page.locator('nav.demian-legal-links a[href="privacy/"]').click();
        await page.waitForURL('**/privacy/');
        assert.equal(await page.locator('h1').innerText(), 'سیاست حریم خصوصی');
    } finally {
        await context.close();
    }
    console.log('Step 32: 3 Persian legal pages and mobile navigation passed in Chromium.');
} finally {
    await browser?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
