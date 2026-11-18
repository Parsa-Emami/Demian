import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase6-step31');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build the static release before Step 31 QA');
mkdirSync(output, { recursive: true });
const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('Invalid path');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});
const report = {
    schema: 1,
    status: 'pending',
    emulatedDevices: true,
    physicalDeviceVerified: false,
    serverAuthVerifiedHere: false,
    realBackendAndPrizesVerifiedHere: false,
    entries: [],
    errors: [],
    limitations: [
        'Chromium emulation is not a physical Android or iOS acceptance run.',
        'This UI check runs on the statically exported practice build and never issues prizes.',
        'All-six-game browser tests and PHP SQLite/MySQL auth/replay/coupon tests are independent CI gates.',
        'A real production host, 50-user concurrency and independent red-team review remain release gates.',
    ],
};
let browser;
try {
    await new Promise(ready => server.listen(0, '127.0.0.1', ready));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (const view of [
        { name: 'phone-320-portrait', width: 320, height: 568 },
        { name: 'phone-390-portrait', width: 390, height: 844 },
        { name: 'phone-844-landscape', width: 844, height: 390 },
        { name: 'desktop-1360', width: 1360, height: 900 },
    ]) {
        const mobile = view.name.startsWith('phone-');
        const context = await browser.newContext({
            viewport: { width: view.width, height: view.height },
            deviceScaleFactor: mobile ? 2 : 1,
            isMobile: mobile,
            hasTouch: mobile,
            serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            const pageErrors = [];
            page.on('pageerror', err => pageErrors.push(err.message));
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForFunction(
                () => window.demianGameApplication?.sessionState === 'menu',
                null,
                { timeout: 35000 }
            );
            const menu = page.locator('[data-screen="cafe-menu"]');
            assert.equal(await menu.isVisible(), true);
            const openCharacters = mobile ? menu.locator('.cafe-menu__showcase')
                : menu.getByRole('button', { name: 'بازکردن مدیریت کاراکترها', exact: true });
            await openCharacters.waitFor({ state: 'visible' });
            await openCharacters.scrollIntoViewIfNeeded();
            if (mobile) {
                await page.waitForFunction(() => [...document.querySelectorAll('.cafe-menu__portrait img')]
                    .every(image => image.complete && image.naturalWidth > 0), null, { timeout: 12000 });
                assert.equal(await openCharacters.locator('img').count(), 3);
            }
            const geometry = await page.evaluate(() => {
                const screen = document.querySelector('[data-screen="cafe-menu"]');
                const content = screen.querySelector('.cafe-menu__content');
                return {
                    viewport: innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    menuWidth: screen.clientWidth,
                    contentWidth: content.scrollWidth,
                    scrollable: screen.scrollHeight > screen.clientHeight,
                    actions: [...screen.querySelectorAll('.cafe-menu__actions button')]
                        .map(button => ({ action: button.dataset.shellAction, width: button.getBoundingClientRect().width,
                            height: button.getBoundingClientRect().height })),
                };
            });
            assert.ok(geometry.documentWidth <= view.width + 2, JSON.stringify(geometry));
            assert.ok(geometry.contentWidth <= geometry.menuWidth + 2, JSON.stringify(geometry));
            assert.equal(geometry.actions.length, 5);
            assert.ok(geometry.actions.every(action => action.width >= 44 && action.height >= 44));
            await page.screenshot({
                path: resolve(output, `mobile-home-${view.name}.png`),
                fullPage: false,
            });
            await openCharacters.click();
            await page.waitForFunction(
                () => document.querySelector('[data-manager-shell]')?.dataset.sidebarState === 'expanded',
                null,
                { timeout: 10000 }
            );
            await page.locator('.manager-sidebar').evaluate(async sidebar => {
                const elements = [sidebar, sidebar.querySelector('.manager-sidebar__scroll'),
                    sidebar.querySelector('.sidebar-expanded-content')];
                const transitions = elements.flatMap(element => element.getAnimations())
                    .filter(animation => animation instanceof CSSTransition);
                await Promise.allSettled(transitions.map(transition => transition.finished));
            });
            const cards = page.locator('[data-character-card]');
            assert.equal(await cards.count(), 12, 'The menu character roster must not be empty');
            const portraitGrid = await page.locator('[data-character-list]').evaluate(element => ({
                columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
                rows: new Set([...element.children].map(card => Math.round(card.offsetTop))).size,
                portraitCount: element.querySelectorAll('.character-card--portrait').length,
                width: element.clientWidth,
                scrollWidth: element.scrollWidth,
                framesFit: [...element.children].every(card => {
                    const bounds = card.getBoundingClientRect();
                    const frame = card.querySelector('.character-card__preview').getBoundingClientRect();
                    return frame.width > 0 && frame.height > 0 &&
                        frame.left >= bounds.left - 1 && frame.right <= bounds.right + 1 &&
                        frame.top >= bounds.top - 1 && frame.bottom <= bounds.bottom + 1;
                }),
            }));
            assert.equal(portraitGrid.portraitCount, 12);
            assert.equal(portraitGrid.columns, view.width <= 365 ? 3 : 4);
            assert.equal(portraitGrid.rows, 12 / portraitGrid.columns);
            assert.ok(portraitGrid.scrollWidth <= portraitGrid.width + 2, `${view.name}: ${JSON.stringify(portraitGrid)}`);
            assert.ok(portraitGrid.framesFit, `${view.name}: portrait frames must fit within their cards`);
            const limit = view.width === 390 ? 12 : 3;
            for (let i = 0; i < limit; i++) {
                const canvas = cards.nth(i).locator('[data-character-preview]');
                await canvas.scrollIntoViewIfNeeded();
                await page.waitForFunction(
                    index => document.querySelectorAll('[data-character-preview]')[index]?.dataset.previewState === 'ready',
                    i,
                    { timeout: 15000 }
                );
                const painted = await canvas.evaluate(element => {
                    const ctx = element.getContext('2d', { willReadFrequently: true });
                    const pixels = ctx.getImageData(0, 0, element.width, element.height).data;
                    let visible = 0;
                    for (let j = 3; j < pixels.length; j += 4) if (pixels[j] > 20) visible++;
                    return visible > element.width * element.height * 0.01;
                });
                assert.equal(painted, true, `Portrait ${i} must include visible pixels`);
            }
            if (view.width === 390) {
                await page.locator('[data-character-card="builtin-negar"] [data-select-character]').click();
                await page.waitForFunction(
                    () => window.demianGameApplication?.characterVisuals.activeSlug === 'negar',
                    null,
                    { timeout: 10000 }
                );
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(
                    () => window.demianGameApplication?.sessionState === 'menu',
                    null,
                    { timeout: 35000 }
                );
                assert.equal(await page.evaluate(
                    () => window.demianGameApplication.characterVisuals.activeSlug
                ), 'negar');
            }
            assert.deepEqual(pageErrors, [], `Browser exceptions on ${view.name}`);
            report.entries.push({
                ...view,
                status: 'passed',
                rosterCards: await cards.count(),
                checkedPortraits: limit,
                portraitGrid,
                geometry,
                javascriptErrors: pageErrors,
            });
        } finally {
            await context.close();
        }
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(String(error.stack ?? error));
    throw error;
} finally {
    writeFileSync(resolve(output, 'mobile-characters-browser.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
    console.log(JSON.stringify(report, null, 2));
}
