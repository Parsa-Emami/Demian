import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(project, '_site'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/project-identity/browser'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const prefix = '/relocated/demian/';
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (!url.pathname.startsWith(prefix)) throw Error('Outside relocation path');
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        const file = resolve(release, path.endsWith('/') || !path ? path + 'index.html' : path);
        if (!file.startsWith(release + '/')) throw Error('Outside release');
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = { physicalPhoneMeasured: false, mode: 'Headless Chromium; emulated phone dimensions; software rendering', profiles: [] };
try {
    browser = await chromium.launch({ headless: true, ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    report.browser = browser.version();
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    const infoResponse = await fetch(`${base}game-info.json`);
    assert.equal(infoResponse.status, 200);
    const info = await infoResponse.json();
    assert.equal(info.creator.website, 'https://parsaaemm.dev/');
    assert.equal(info.developmentCostEstimate.minimum, 5000);
    assert.equal(info.developmentCostEstimate.maximum, 10000);
    assert.equal(info.developmentCostEstimate.isSalePrice, false);
    const text = await (await fetch(`${base}llms.txt`)).text();
    assert.ok(text.includes('USD 5,000–10,000') && text.includes('Parsa Emami'));
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 1000, hasTouch: width < 1000 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        assert.equal(await page.locator('[data-creator-link]').getAttribute('href'), info.creator.website);
        const schema = await page.locator('#demian-project-schema').textContent().then(JSON.parse);
        assert.equal(schema.creator.name, info.creator.name);
        assert.equal(schema.creator.url, info.creator.website);
        assert.ok(schema.description.includes('USD 5,000–10,000'));
        assert.equal(Object.hasOwn(schema, 'offers'), false);
        const popupPromise = page.waitForEvent('popup');
        await page.locator('[data-screen="cafe-menu"] [data-project-about]').click();
        const about = await popupPromise;
        await about.waitForLoadState('domcontentloaded');
        assert.equal(about.url(), base + 'about.html');
        assert.ok(await about.locator('.creator').innerText().then(text => text.includes('Parsa Emami')));
        assert.equal(await about.locator('.price').innerText(), 'USD 5,000–10,000');
        assert.equal(await about.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.equal(await about.locator('nav a').first().getAttribute('href'), './');
        assert.deepEqual(await about.locator('#demian-project-schema').textContent().then(JSON.parse), schema);
        await about.screenshot({ path: resolve(out, `about-${width}x${height}.png`), fullPage: true });
        await about.close();
        await page.bringToFront();
        await page.evaluate(() => window.demianGameApplication.launchGame('coffee-crash'));
        await page.locator('[data-coffee-dialog-action="start"]').click();
        await page.evaluate(() => window.demianGameApplication.pauseGame());
        assert.equal(await page.locator('[data-screen="pause"] [data-project-about]').isVisible(), true);
        assert.equal(await page.evaluate(() => window.demianGameApplication.sessionState), 'paused');
        assert.deepEqual(errors, []);
        report.profiles.push({ width, height, credit: 'passed', estimate: 'passed', newHostSubpath: 'passed', metadata: 'passed', pauseLink: 'passed', horizontalOverflow: false, errors });
        console.log(`Demian project identity ${width}x${height}: passed`);
        await context.close();
    }
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally {
    await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise(done => server.close(done));
}
