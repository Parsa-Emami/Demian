import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(project, '_site'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/release-v18-coffee-crash/browser'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(release, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
        if (!file.startsWith(release + '/')) throw Error('Outside release');
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = { mode: 'headless Chromium, emulated viewports and touch; software rendering', physicalPhoneMeasured: false, profiles: [] };
try {
    browser = await chromium.launch({ headless: true, ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    report.browser = browser.version();
    for (const profile of [
        { name: 'small-phone', width: 320, height: 568 },
        { name: 'phone', width: 390, height: 844 },
        { name: 'landscape', width: 844, height: 390 },
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'reduced-motion', width: 390, height: 844, reduced: true },
    ]) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, isMobile: profile.width < 1000, hasTouch: profile.width < 1000, reducedMotion: profile.reduced ? 'reduce' : 'no-preference' });
        await context.addInitScript(() => {
            window.coffeeQaPad = { connected: false, buttons: [], axes: [0, 0] };
            Object.defineProperty(navigator, 'getGamepads', { value: () => window.coffeeQaPad.connected ? [{
                index: 0, connected: true, mapping: 'standard', axes: window.coffeeQaPad.axes,
                buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: window.coffeeQaPad.buttons.includes(index), value: Number(window.coffeeQaPad.buttons.includes(index)) })),
            }] : [] });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        await page.evaluate(() => window.demianGameApplication.launchGame('coffee-crash'));
        assert.equal(await page.locator('.coffee-dialog').isVisible(), true);
        assert.equal(await page.locator('[data-coffee-level-choice="2"]').isEnabled(), false);
        await page.locator('[data-coffee-dialog-action="skip"]').click();
        assert.equal(await page.locator('[data-coffee-cell]').count(), 56);
        const geometry = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            grid: document.querySelector('.coffee-grid').getBoundingClientRect().toJSON(),
            worktop: document.querySelector('.coffee-worktop').getBoundingClientRect().toJSON(),
            scrollHeight: document.querySelector('.coffee-worktop').scrollHeight,
            clientHeight: document.querySelector('.coffee-worktop').clientHeight,
        }));
        assert.equal(geometry.overflow, false);
        assert.ok(geometry.grid.width > 250 && geometry.grid.right <= profile.width + 1);
        if (profile.name === 'desktop') assert.ok(geometry.scrollHeight <= geometry.clientHeight + 1);
        await page.screenshot({ path: resolve(out, `${profile.name}.png`) });
        const before = await page.evaluate(() => window.demianGameApplication.activeGame.model.snapshot());
        const pair = await page.evaluate(() => window.demianGameApplication.activeGame.model.findMove());
        if (profile.name === 'phone') {
            const first = await page.locator(`[data-coffee-cell="${pair[0]}"]`).boundingBox();
            const second = await page.locator(`[data-coffee-cell="${pair[1]}"]`).boundingBox();
            const session = await context.newCDPSession(page);
            const a = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
            const b = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
            await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
            await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [b] });
            await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
            await page.locator(`[data-coffee-cell="${pair[0]}"]`).click();
            await page.locator(`[data-coffee-cell="${pair[1]}"]`).click();
        }
        await page.waitForFunction(() => window.demianGameApplication.activeGame.ui.blocked);
        await page.evaluate(() => window.demianGameApplication.pauseGame());
        const paused = await page.evaluate(() => ({ frames: window.demianGameApplication.activeGame.frames.length, model: window.demianGameApplication.activeGame.model.snapshot() }));
        await page.waitForTimeout(300);
        assert.deepEqual(await page.evaluate(() => ({ frames: window.demianGameApplication.activeGame.frames.length, model: window.demianGameApplication.activeGame.model.snapshot() })), paused);
        await page.evaluate(() => window.demianGameApplication.resumeGame());
        await page.waitForFunction(() => !window.demianGameApplication.activeGame.ui.blocked);
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.moves), before.moves - 1);
        await page.locator('[data-coffee-action="undo"]').click();
        assert.deepEqual(await page.evaluate(() => window.demianGameApplication.activeGame.model.snapshot()), before);
        await page.locator('[data-coffee-action="hint"]').click();
        assert.equal(await page.locator('[data-hint="true"]').count(), 2);
        const focused = await page.evaluate(() => Number(document.activeElement.dataset.coffeeCell));
        if (focused % 7 < 6) {
            await page.keyboard.press('ArrowRight');
            assert.equal(await page.evaluate(() => Number(document.activeElement.dataset.coffeeCell)), focused + 1);
        }
        if (profile.name === 'desktop') {
            await page.evaluate(() => { window.coffeeQaPad.connected = true; });
            await page.waitForTimeout(100);
            const focus = await page.evaluate(() => Number(document.activeElement.dataset.coffeeCell));
            await page.evaluate(() => { window.coffeeQaPad.buttons = [0]; });
            await page.waitForFunction(index => window.demianGameApplication.activeGame.ui.selected === index, focus);
            await page.evaluate(() => { window.coffeeQaPad.buttons = []; });
            await page.waitForTimeout(100);
            await page.evaluate(() => { window.coffeeQaPad.axes = [1, 0]; });
            await page.waitForFunction(index => Number(document.activeElement.dataset.coffeeCell) !== index, focus);
            await page.evaluate(() => { window.coffeeQaPad.connected = false; });
        }
        await page.locator('[data-coffee-action="help"]').click();
        assert.equal(await page.locator('.coffee-dialog').isVisible(), true);
        await page.locator('[data-coffee-dialog-action="start"]').click();
        await page.evaluate(() => window.demianGameApplication.exitGame());
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'menu');
        assert.equal(await page.locator('.coffee-hud').count(), 0);
        assert.equal(await page.locator('.coffee-dialog').count(), 0);
        await page.evaluate(() => window.demianGameApplication.launchGame('coffee-crash'));
        assert.equal(await page.locator('.coffee-guide').isVisible(), false);
        await page.locator('[data-coffee-dialog-action="start"]').click();
        await page.evaluate(() => {
            const game = window.demianGameApplication.activeGame;
            game.model.level.goals.forEach(goal => game.model.collected[goal.type] = goal.count);
        });
        const last = await page.evaluate(() => window.demianGameApplication.activeGame.model.findMove());
        await page.locator(`[data-coffee-cell="${last[0]}"]`).click();
        await page.locator(`[data-coffee-cell="${last[1]}"]`).click();
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'results');
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.store.unlocked), 2);
        assert.deepEqual(errors, []);
        report.profiles.push({ ...profile, geometry, errors, swipeOrTap: 'passed', pause: 'passed', undo: 'passed', hints: 'passed', keyboard: 'passed', gamepad: profile.name === 'desktop' ? 'emulated standard mapping passed' : 'not exercised', cleanup: 'passed', guidePersistence: 'passed', result: 'passed' });
        console.log(`Coffee Crash ${profile.name}: passed`);
        await context.close();
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = error.stack; throw error;
} finally {
    await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise(done => server.close(done));
}
