import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(root, '_site'));
const out = resolve(process.env.DEMIAN_QA_OUTPUT_DIR ?? resolve(root, 'docs/validation/master-motion-v1'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
    try {
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(release, `.${path.endsWith('/') ? path + 'index.html' : path}`);
        if (!file.startsWith(release + '/')) throw Error('Outside release');
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end('Not found'); }
});
await mkdir(out, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
    for (const profile of [
        { name: 'desktop', viewport: { width: 1440, height: 960 }, isMobile: false, hasTouch: false },
        { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    ]) {
        const context = await browser.newContext({ ...profile, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = [], failures = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfailed', request => failures.push(request.url()));
        let releaseScript;
        await page.route('**/build/assets/*.js', route => new Promise(resolve => {
            releaseScript = async () => { await route.continue(); resolve(); };
        }));
        await page.goto(url, { waitUntil: 'commit' });
        await page.waitForFunction(() => document.querySelector('.boot-console__logo')?.naturalWidth > 0);
        assert.equal(await page.locator('.boot-console__logo').getAttribute('src'), 'assets/environments/cafe-runner-v1/wordmark.png');
        assert.equal(await page.locator('.boot-console__mark').count(), 0);
        await page.screenshot({ path: resolve(out, `boot-${profile.name}.png`) });
        await releaseScript();
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', { timeout: 45000 });
        await page.getByRole('button', { name: 'مقایسهٔ الگوی حرکت', exact: true }).click();
        await page.waitForFunction(() => {
            const screen = window.demianGameApplication.shell.motionScreen;
            return screen.active && screen.cards.size === 4 && [...screen.cards.values()].every(card => card.avatar);
        });
        const screen = page.locator('[data-screen="motion-comparison"]');
        await page.waitForFunction(() => document.querySelector('[data-screen="motion-comparison"]').dataset.screenState === 'active');
        const title = await page.locator('#motion-lab-title').boundingBox();
        assert(title.y >= 0 && title.y + title.height < profile.viewport.height);
        assert.equal(await screen.evaluate(element => element.scrollTop), 0);
        await screen.getByRole('button', { name: 'توقف حرکت', exact: true }).click();
        await page.locator('[data-motion-phase]').evaluate(element => {
            element.value = '31'; element.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const current = await page.evaluate(() => {
            const screen = window.demianGameApplication.shell.motionScreen;
            return { phase: screen.phase, playing: screen.playing,
                cards: [...screen.cards.values()].map(card => ({ slug: card.slug,
                    family: card.controller.definition.family, pose: card.controller.pose.joints,
                    loaded: Boolean(card.avatar) })),
                overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(current.playing, false);
        assert(Math.abs(current.phase - .31) < 1e-9);
        assert.deepEqual(current.cards[0].pose, current.cards[1].pose);
        assert.deepEqual(current.cards[2].pose, current.cards[3].pose);
        assert.notDeepEqual(current.cards[0].pose, current.cards[2].pose);
        assert.equal(current.overflow, false);
        await page.screenshot({ path: resolve(out, `comparison-${profile.name}.png`) });
        await page.locator('[data-motion-state]').selectOption('slide');
        await screen.getByRole('button', { name: 'یک فریم جلو', exact: true }).click();
        await page.locator('[data-motion-facing]').selectOption('-1');
        await screen.getByRole('button', { name: 'بال‌ها و همراه‌ها', exact: true }).click();
        await page.waitForFunction(() => [...window.demianGameApplication.shell.motionScreen.cards.values()].every(card => card.avatar));
        const accessories = await page.evaluate(() => [...window.demianGameApplication.shell.motionScreen.cards.values()]
            .map(card => ({ slug: card.slug, attachments: card.controller.attachments.map(item => item.kind) })));
        assert.deepEqual(accessories.map(entry => entry.slug), ['uzudi', 'amirreza', 'darya', 'tiam']);
        assert.deepEqual(accessories[0].attachments, ['wings']);
        assert.deepEqual(accessories[2].attachments, ['pishi']);
        await page.screenshot({ path: resolve(out, `accessories-${profile.name}.png`) });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !window.demianGameApplication.shell.motionScreen.active);
        assert.equal(await page.evaluate(() => window.demianGameApplication.shell.motionScreen.request), null);
        assert.equal(await page.evaluate(() => window.demianGameApplication.shell.motionScreen.cards.size), 0);
        await page.getByRole('button', { name: 'ورود سریع به Open World', exact: true }).click();
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'playing');
        assert.equal(await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.animator.masterMotion.definition.family), 'female-base-v1');
        await page.keyboard.press('ArrowRight');
        await page.getByRole('button', { name: 'بازگشت به منو', exact: true }).click();
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'menu');
        assert.deepEqual(errors, []);
        assert.deepEqual(failures, []);
        results.push({ profile: profile.name, viewport: profile.viewport, bootLogo: 'runner-wordmark',
            samples: current.cards.map(({ slug, family }) => ({ slug, family })), synchronizedPose: true,
            inputAndAccessoryChecks: true, cleanClose: true, productionController: true, errors, failures });
        await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
    await page.getByRole('button', { name: 'مقایسهٔ الگوی حرکت', exact: true }).click();
    await page.waitForFunction(() => window.demianGameApplication.shell.motionScreen.active);
    assert.equal(await page.evaluate(() => window.demianGameApplication.shell.motionScreen.playing), false);
    await page.getByRole('button', { name: 'یک فریم جلو', exact: true }).click();
    assert(await page.evaluate(() => window.demianGameApplication.shell.motionScreen.phase > 0));
    results.push({ profile: 'reduced-motion', pausedOnOpen: true, manualFrameStep: true });
    await context.close();
    await writeFile(resolve(out, 'browser-checks.json'), JSON.stringify({ browser: 'headless Chromium', rendering: 'software SwiftShader', physicalDevices: false, results }, null, 2) + '\n');
    console.log('Master motion browser checks passed: desktop, emulated phone, reduced motion, logo first paint, shared pose, accessories and production integration.');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
