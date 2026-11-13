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
    assert.equal(Object.hasOwn(info, 'developmentCostEstimate'), false);
    assert.equal(info.creator.displayName, 'parsaaemm');
    assert.equal(info.creator.profiles.linkedin, 'https://www.linkedin.com/in/parsaaemm/');
    assert.equal((await fetch(`${base}about.html`)).status, 404);
    assert.equal((await fetch(`${base}resources/game/project-business-context.json`)).status, 404);
    const text = await (await fetch(`${base}llms.txt`)).text();
    assert.ok(text.includes('Parsa Emami') && text.includes('https://www.linkedin.com/in/parsaaemm/'));
    assert.equal(/cost|estimate|5,000|10,000/i.test(text), false);
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
        assert.equal(/cost|estimate|5,000|10,000/i.test(JSON.stringify(schema)), false);
        assert.ok(schema.creator.sameAs.includes(info.creator.profiles.linkedin));
        assert.equal(Object.hasOwn(schema, 'offers'), false);
        assert.equal(await page.locator('[data-creator-link]').innerText(), 'parsaaemm');
        assert.equal(await page.locator('[data-project-about]').count(), 0);
        const credit = page.locator('[data-creator-link]');
        await credit.scrollIntoViewIfNeeded();
        const geometry = await page.evaluate(() => {
            const link = document.querySelector('[data-creator-link]').getBoundingClientRect();
            const parent = document.querySelector('[data-project-credit]').getBoundingClientRect();
            return { centered: Math.abs(link.x + link.width / 2 - parent.x - parent.width / 2) < 2,
                horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.equal(geometry.centered, true);
        assert.equal(geometry.horizontalOverflow, false);
        assert.equal(/برآورد|هزینه|Software Engineer/.test(await page.locator('[data-screen="cafe-menu"]').innerText()), false);
        await page.screenshot({ path: resolve(out, `credit-${width}x${height}.png`) });
        await context.route('https://parsaaemm.dev/', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Portfolio navigation target</title>' }));
        // A target=_blank rel=noopener window is a separate top-level
        // browsing context. Listen at context level so it is detected even
        // when the opener relationship is intentionally absent.
        assert.equal(await credit.getAttribute('target'), '_blank');
        assert.match(await credit.getAttribute('rel'), /noopener/);
        const popupPromise = context.waitForEvent('page', { timeout: 15000 });
        await credit.click();
        const portfolio = await popupPromise;
        await portfolio.waitForURL('https://parsaaemm.dev/', { waitUntil: 'commit' });
        await portfolio.close();
        await page.bringToFront();
        await page.evaluate(() => window.demianGameApplication.launchGame('coffee-crash'));
        await page.locator('[data-coffee-dialog-action="start"]').click();
        await page.evaluate(() => window.demianGameApplication.pauseGame());
        assert.equal(await page.locator('[data-screen="pause"] [data-project-about]').count(), 0);
        assert.equal(/برآورد|هزینه/.test(await page.locator('[data-screen="pause"]').innerText()), false);
        assert.equal(await page.evaluate(() => window.demianGameApplication.sessionState), 'paused');
        assert.deepEqual(errors, []);
        report.profiles.push({ width, height, centeredCredit: 'passed', publicPricingRemoved: 'passed', removedAboutPage: 'passed', newHostSubpath: 'passed', metadata: 'passed', websiteLink: 'passed', horizontalOverflow: false, errors });
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
