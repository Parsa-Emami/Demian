/**
 * Mobile-05 — production build browser contract for 2-finger controls,
 * cancellation, layout/rotation and physical viewport hit boxes.
 * Headless Chromium emulation is NOT real iOS/Android device certification.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '..');
const release = resolve(project, '_site');
const output = resolve(project, 'docs/mobile-05/browser');
if (!existsSync(resolve(release, 'index.html'))) throw new Error('Build static release first');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw new Error('unsafe');
        const file = resolve(release, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(release + sep) || !statSync(file).isFile()) throw new Error('missing');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch {
        res.writeHead(404); res.end();
    }
});
const listen = () => new Promise(ok => server.listen(0, '127.0.0.1', ok));
const close = () => new Promise(ok => server.close(ok));
const report = { status: 'pending', physicalPhoneMeasured: false, browser: null,
    scenarios: [], errors: [], limitations: [
        'Headless Chromium touch emulation is not iOS Safari/WebKit or real touch latency.',
        'Safe-area insets are zero in this emulated display; rotated remapping is separately asserted in CSS and must be tested on a notch device.',
        'Game score or weekly leaderboard are unaffected by these tests.',
    ] };
mkdirSync(output, { recursive: true });
let browser, context, page;
const getRect = async locator => {
    const b = await locator.boundingBox();
    assert.ok(b && b.width >= 44 && b.height >= 44, 'touch control hit target must be visible and >=44 CSS px');
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2),
        bounds: b };
};
const within = (rect, width, height) =>
    rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1;
try {
    await listen();
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    report.browser = browser.version();
    context = await browser.newContext({ viewport: { width: 390, height: 844 },
        isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,
        { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
        null, { timeout: 120000 });
    await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'playing',
        null, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('[data-character-manager]')?.dataset.forcedLandscape === 'true');

    const root = page.locator('[data-character-manager]');
    const stick = page.locator('[data-virtual-stick]');
    const jump = page.locator('[data-control-surface="world"] [data-input-press="jump"]');
    const joystick = await getRect(stick);
    const action = await getRect(jump);
    assert.ok(within(joystick.bounds, 390, 844), 'portrait stick must be physically inside the viewport');
    assert.ok(within(action.bounds, 390, 844), 'portrait jump must be physically inside the viewport');
    const cdp = await context.newCDPSession(page);
    const t1 = { x: joystick.x, y: joystick.y, id: 1 };
    const t2 = { x: action.x, y: action.y, id: 2 };
    const moved = { x: joystick.x + 22, y: joystick.y - 6, id: 1 };

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [t1] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [t1, t2] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved, t2] });
    await page.waitForFunction(() => {
        const input = window.demianGameApplication.input;
        return input.touchStick?.value.magnitude > .1 && input.pointerHolds.size >= 1;
    }, null, { timeout: 6000 });
    const concurrent = await page.evaluate(() => {
        const input = window.demianGameApplication.input;
        return { stickMagnitude: input.touchStick.value.magnitude,
            heldPointers: input.pointerHolds.size, joystickPointer: input.touchStick.gesture?.id };
    });
    assert.ok(concurrent.stickMagnitude > .1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [moved] });
    await page.waitForFunction(() => window.demianGameApplication.input.pointerHolds.size === 0);
    assert.ok((await page.evaluate(() => window.demianGameApplication.input.touchStick.value.magnitude)) > .1,
        'ending action finger must not reset movement finger');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForFunction(() => {
        const input = window.demianGameApplication.input;
        return input.touchStick.value.magnitude === 0 && input.pointerHolds.size === 0;
    });
    report.scenarios.push({ name: 'portrait-forced-landscape-two-finger-cancel',
        status: 'passed', concurrent, stick: joystick.bounds, jump: action.bounds });
    await page.screenshot({ path: resolve(output, 'portrait.png') });
    // The gesture system must also reset when the operating system backgrounds
    // the page or orientation changes without delivering pointerup.
    await page.evaluate(() => {
        const input = window.demianGameApplication.input;
        input.virtualHeld.add('run');
        input.virtualPressed.add('jump');
        window.dispatchEvent(new Event('pagehide'));
    });
    assert.deepEqual(await page.evaluate(() => {
        const i = window.demianGameApplication.input;
        return [i.virtualHeld.size, i.virtualPressed.size, i.pointerHolds.size, i.touchStick.value.magnitude];
    }), [0, 0, 0, 0]);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('[data-character-manager]')?.dataset.forcedLandscape === 'false');
    const landscapeStick = await getRect(stick);
    const landscapeAction = await getRect(jump);
    assert.ok(within(landscapeStick.bounds, 844, 390), 'landscape stick outside screen');
    assert.ok(within(landscapeAction.bounds, 844, 390), 'landscape action outside screen');
    report.scenarios.push({ name: 'landscape-reflow-and-target-sizes', status: 'passed',
        stick: landscapeStick.bounds, jump: landscapeAction.bounds });
    await page.screenshot({ path: resolve(output, 'landscape.png') });
    // Rotation/blur clears all input, regardless of whether a pointerup arrives.
    await page.evaluate(() => {
        const i = window.demianGameApplication.input;
        i.virtualHeld.add('run');
        i.analog.magnitude = 1;
        window.dispatchEvent(new Event('blur'));
    });
    const afterBlur = await page.evaluate(() => {
        const i = window.demianGameApplication.input;
        return { held: i.virtualHeld.size, magnitude: i.analog.magnitude };
    });
    assert.deepEqual(afterBlur, { held: 0, magnitude: 0 });
    report.scenarios.push({ name: 'pagehide-and-blur-clear-input', status: 'passed' });
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
} catch (error) {
    report.errors.push(error.stack ?? String(error));
    report.status = 'failed';
} finally {
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, 'mobile-touch-qa.json'), JSON.stringify(report, null, 2) + '\n');
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (server.listening) await close();
}
if (report.status !== 'passed') {
    console.error('[Mobile-05] Browser QA failed:', report.errors);
    process.exitCode = 1;
} else console.log('[Mobile-05] Touch + orientation browser QA passed', report.scenarios.map(x => x.name));
