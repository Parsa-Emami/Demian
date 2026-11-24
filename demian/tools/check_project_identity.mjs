import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(project, '_site'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/project-identity/browser'));
const { chromium, webkit } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
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
const engine = process.env.DEMIAN_QA_ENGINE ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const report = { physicalPhoneMeasured: false, mode: `Headless ${engine}; emulated phone dimensions; software rendering`, engine, profiles: [] };
try {
    browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engine === 'chromium' ? { ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
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
    for (const [width, height] of [[320, 480], [320, 568], [360, 640], [360, 740], [375, 667], [390, 844], [393, 873], [430, 932], [667, 375], [844, 390], [768, 1024], [1440, 900]]) {
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
        const menu = page.locator('[data-screen="cafe-menu"]');
        assert.equal(await menu.locator('.cafe-menu__eyebrow, .cafe-menu__lead').count(), 0);
        assert.equal(/PLAY YOUR WAY|کمی بگرد/.test(await menu.innerText()), false);
        assert.equal(await menu.locator('.cafe-menu__footer, [data-game-library-summary]').count(), 0);
        assert.equal((await menu.innerText()).includes('بازی‌های کوچک، ماجراجویی‌های بزرگ'), false);
        assert.equal(await menu.locator('.demian-legal-links a').count(), 3);
        assert.equal(await menu.locator('h1').innerText(), 'DEMIAN');
        assert.equal(await menu.locator('[data-shell-action="play"]').count(), 1);
        const favicon = page.locator('head link[rel="icon"]');
        assert.equal(await favicon.count(), 1);
        assert.equal(await favicon.getAttribute('href'), 'icons/demian-192.png');
        const iconResponse = await page.request.get(new URL('icons/demian-192.png', page.url()).href);
        assert.equal(iconResponse.status(), 200);
        assert.match(iconResponse.headers()['content-type'], /^image\/png/);
        assert.deepEqual([...((await iconResponse.body()).subarray(0, 8))], [137, 80, 78, 71, 13, 10, 26, 10]);
        const credit = page.locator('[data-creator-link]');
        await page.evaluate(() => document.fonts.ready);
        await page.locator('style[data-welcome-layout="viewport-v3"]').count().then(count => assert.equal(count, 1));
        const geometry = await page.evaluate(() => {
            const link = document.querySelector('[data-creator-link]').getBoundingClientRect();
            const parent = document.querySelector('[data-project-credit]').getBoundingClientRect();
            const screen = document.querySelector('[data-screen="cafe-menu"]');
            const frame = screen.getBoundingClientRect();
            const viewport = window.visualViewport;
            const viewportBottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
            const reward = screen.querySelector('[data-shell-action="rewards"]').getBoundingClientRect();
            const character = screen.querySelector('.menu-character-button').getBoundingClientRect();
            const targets = [...screen.querySelectorAll('.cafe-menu__showcase, .cafe-menu__actions button, .demian-legal-links a, [data-creator-link]')];
            const clipped = targets.filter(element => {
                const r = element.getBoundingClientRect();
                return r.width < 43.95 || r.height < 43.95 || r.left < frame.left - 1 || r.right > frame.right + 1
                    || r.top < frame.top - 1 || r.bottom > Math.min(frame.bottom, viewportBottom) + 1;
            }).map(element => {
                const r = element.getBoundingClientRect();
                return { label: element.textContent.trim(), x:r.x, y:r.y, width:r.width, height:r.height,
                    screen: { x:frame.x, y:frame.y, width:frame.width, height:frame.height } };
            });
            return { clipped, paired: Math.abs(reward.top - character.top) < 2 && (reward.right <= character.left + 1 || character.right <= reward.left + 1), creditFullyVisible: parent.bottom <= viewportBottom + 1, verticalOverflow: screen.scrollHeight > screen.clientHeight + 1,
                centered: Math.abs(link.x + link.width / 2 - parent.x - parent.width / 2) < 2,
                horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.deepEqual(geometry.clipped, [], 'Every menu control must be visible and at least 44px high at ' + width + 'x' + height);
        assert.equal(geometry.verticalOverflow, false, 'The welcome screen must fit without scrolling');
        assert.equal(geometry.centered, true);
        assert.equal(geometry.paired, true, 'Rewards and character selection must share a row');
        assert.equal(geometry.creditFullyVisible, true, 'Creator credit must fit in visual viewport');
        assert.equal(geometry.horizontalOverflow, false);
        assert.equal(/برآورد|هزینه|Software Engineer/.test(await page.locator('[data-screen="cafe-menu"]').innerText()), false);
        await page.screenshot({ path: resolve(out, `credit-${width}x${height}.png`) });
        // Validate safe link semantics on every viewport. A trusted click is
        // exercised once, on the smallest profile, under an intercepted route.
        // Coffee Crash launch/pause is already covered by its dedicated browser
        // suite; starting that GPU-heavy game after an external noopener popup
        // made this identity-only CI check intermittently exceed 180 seconds.
        assert.equal(await credit.getAttribute('target'), '_blank');
        assert.match(await credit.getAttribute('rel'), /noopener/);
        if (engine === 'chromium' && width === 320 && height === 568) {
            await context.route('https://parsaaemm.dev/', route => route.fulfill({
                status: 200, contentType: 'text/html', body: '<title>Portfolio navigation target</title>',
            }));
            await page.evaluate(() => {
                const link = document.querySelector('[data-creator-link]');
                link.addEventListener('click', event => {
                    window.__demianCreatorClick = {
                        trusted: event.isTrusted, prevented: event.defaultPrevented, destination: link.href,
                    };
                }, { once: true });
            });
            await credit.click({ noWaitAfter: true, timeout: 12000 });
            await page.waitForFunction(() => Boolean(window.__demianCreatorClick), null, { timeout: 10000 });
            const click = await page.evaluate(() => window.__demianCreatorClick);
            assert.equal(click.trusted, true);
            assert.equal(click.prevented, false);
            assert.equal(click.destination, info.creator.website);
        }
        // Check the pause view's static content without launching another
        // scene. Behavioral pause/resume assertions live in gameplay QA.
        assert.equal(await page.locator('[data-screen="pause"] [data-project-about]').count(), 0);
        assert.equal(/برآورد|هزینه/.test(
            (await page.locator('[data-screen="pause"]').textContent()) ?? '',
        ), false);
        assert.deepEqual(errors, []);
        report.profiles.push({ width, height, engine, centeredCredit: 'passed', publicPricingRemoved: 'passed', removedAboutPage: 'passed', newHostSubpath: 'passed', metadata: 'passed', websiteLink: 'passed', horizontalOverflow: false, errors });
        console.log(`Demian project identity ${engine} ${width}x${height}: passed`);
        await context.close();
    }
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally {
    await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise(done => server.close(done));
}
