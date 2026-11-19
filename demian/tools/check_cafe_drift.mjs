import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const url = new URL(process.env.DEMIAN_DRIFT_QA_URL ?? 'http://127.0.0.1:18879/');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const output = process.env.DEMIAN_DRIFT_QA_OUTPUT ?? '/tmp/demian-drift-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function play({ width, height, touch = false, ranked = false }) {
    const context = await browser.newContext({
        viewport: { width, height }, isMobile: touch, hasTouch: touch, serviceWorkers: 'block',
        reducedMotion: touch ? 'reduce' : 'no-preference',
    });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        await page.locator('[data-screen="cafe"] [data-shell-action="play"], [data-screen="cafe-menu"] [data-shell-action="play"]').click();
        await page.locator('[data-game-launch="cafe-drift"]').click();
        const start = page.locator(ranked ? '[data-drift-start]' : '[data-drift-practice]');
        await start.waitFor({ state: 'visible' });
        await page.screenshot({ path: join(output, `entry-${width}.png`) });
        const completed = ranked ? page.waitForResponse(
            response => /\/turn-runs\/[^/]+\/complete$/.test(response.url()),
            { timeout: 80000 },
        ).catch(error => error) : null;
        await start.click();
        if (ranked) {
            await page.locator('[data-legal-terms]').waitFor({ state: 'visible' });
            const profile = page.locator('[data-demian-legal-consent] input[name="display_name"]');
            if (await profile.count()) {
                await profile.fill('Drift QA Player');
                await page.locator('[data-demian-legal-consent] select[name="contact_type"]').selectOption('email');
                await page.locator('[data-demian-legal-consent] input[name="contact_value"]')
                    .fill(`drift-qa-${Date.now()}@example.test`);
            }
            await page.locator('[data-legal-terms]').check();
            await page.locator('[data-legal-privacy]').check();
            await page.locator('[data-legal-confirm]').click();
        }
        await page.waitForFunction(() => window.demianGameApplication.activeGame.active);
        if (ranked) {
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.rankRun?.mode), 'ranked');
            await page.keyboard.down('ArrowRight');
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.x > 1100);
            await page.keyboard.up('ArrowRight');
            await page.keyboard.down('ArrowLeft');
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.x < -850);
            await page.keyboard.up('ArrowLeft');
        } else {
            const area = await page.locator('[data-drift-pointer]').boundingBox();
            const cdp = await context.newCDPSession(page);
            const y = area.y + area.height * .67;
            const point = ratio => ({ x: area.x + area.width * ratio, y, id: 0 });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.5)] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.82)] });
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.x > 1100);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.18)] });
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.x < -1100);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.tick >= 75);
        await page.screenshot({ path: join(output, `round-${width}.png`) });
        const visible = await page.locator('.drift-hud__stats').boundingBox();
        assert.ok(visible.width > 0 && visible.x >= 0 && visible.x + visible.width <= width + 1);
        const controls = await page.locator('.play-toolbar button:visible').evaluateAll(nodes =>
            nodes.map(node => node.getBoundingClientRect().toJSON()));
        for (const control of controls) {
            const overlaps = control.right > visible.x && control.left < visible.x + visible.width
                && control.bottom > visible.y && control.top < visible.y + visible.height;
            assert.equal(overlaps, false, 'The toolbar must leave all HUD values visible.');
        }
        if (ranked) {
            const result = await completed;
            if (result instanceof Error) throw result;
            assert.equal(result.status(), 200, await result.text());
            const receipt = await result.json();
            assert.equal(receipt.verification, 'server-replay');
            assert.equal(receipt.score, await page.evaluate(() => window.demianGameApplication.activeGame.model.score));
            const body = result.request().postDataJSON();
            assert.deepEqual(Object.keys(body).sort(), ['frames', 'ticks']);
            const weekly = await page.request.get(new URL('/api/v1/arcade/leaderboards/cafe-drift?period=weekly', url).href);
            assert.equal(weekly.status(), 200);
            assert.ok((await weekly.json()).data.some(row => row.score === receipt.score));
            await page.waitForFunction(() => window.demianGameApplication.sessionState === 'results');
            await page.screenshot({ path: join(output, 'results.png') });
            await page.locator('[data-screen="results"] [data-shell-action="leaderboard"]').click();
            await page.waitForFunction(() => document.querySelector('[data-ranking-personal-best]').textContent.includes('رتبهٔ شما'));
            assert.equal(await page.locator('[data-ranking-game]').inputValue(), 'cafe-drift');
            assert.equal(await page.locator('[data-ranking-week]').isEnabled(), true);
            await page.screenshot({ path: join(output, 'leaderboard.png') });
        } else {
            await page.locator('.play-toolbar [data-shell-action="pause"]').click();
            await page.waitForFunction(() => window.demianGameApplication.sessionState === 'paused');
            await page.locator('[data-screen="pause"] [data-shell-action="resume"]').click();
            await page.waitForFunction(() => window.demianGameApplication.sessionState === 'playing');
        }
        assert.deepEqual(errors, []);
        console.log(`Café Drift ${width}×${height} ${touch ? 'touch' : 'keyboard'}: passed`);
    } finally {
        await context.close();
    }
}

try {
    await play({ width: 1440, height: 900, ranked: true });
    await play({ width: 320, height: 568, touch: true });
    await play({ width: 390, height: 844, touch: true });
    await play({ width: 844, height: 390, touch: true });
} finally {
    await browser.close();
}
