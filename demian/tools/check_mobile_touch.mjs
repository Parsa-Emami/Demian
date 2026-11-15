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
async function rootOrientation(page) {
    return page.evaluate(() => document.querySelector('[data-character-manager]')?.dataset.forcedLandscape);
}
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
    // All six published game definitions currently use orientation:'any'.
    // Portrait is first-class; never change the actual product to locked
    // landscape merely to make this browser test pass.
    await page.waitForFunction(() =>
        document.querySelector('[data-character-manager]')?.dataset.physicalOrientation === 'portrait');
    assert.equal(await rootOrientation(page), 'false');

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
    // CDP can synthesize multiple simultaneous contacts, but partial
    // contact release is not consistently surfaced as a button pointerup in
    // headless Chromium. Exercise action termination via a real DOM PointerEvent
    // while the first finger's CDP-driven joystick remains in motion. Unit
    // tests independently verify browser-cancelled pointer ownership.
    await page.evaluate(() => {
        const input = window.demianGameApplication.input;
        for (const [pointerId, { button }] of [...input.pointerHolds]) {
            button.dispatchEvent(new PointerEvent('pointerup',
                { bubbles: true, pointerType: 'touch', pointerId, button: 0 }));
        }
    });
    await page.waitForFunction(() => window.demianGameApplication.input.pointerHolds.size === 0);
    assert.ok((await page.evaluate(() => window.demianGameApplication.input.touchStick.value.magnitude)) > .1,
        'ending action finger must not reset movement finger');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForFunction(() => {
        const input = window.demianGameApplication.input;
        return input.touchStick.value.magnitude === 0 && input.pointerHolds.size === 0;
    });
    report.scenarios.push({ name: 'portrait-two-finger-cancel',
        status: 'passed', concurrent, stick: joystick.bounds, jump: action.bounds });
    await page.screenshot({ path: resolve(output, 'portrait.png') });

    // Step 19: an optional action tray must never disappear while the player
    // is still pressing an action. 140ms timer auto-collapse previously
    // destroyed captured gestures. Test actual compiled UI and input router.
    await page.locator('[data-mobile-actions-toggle]').tap();
    await page.waitForFunction(() =>
        document.querySelector('[data-character-manager]')?.dataset.mobileActions === 'expanded');
    await page.evaluate(() => {
        const button = document.querySelector('[data-mobile-actions-tray] [data-input-press="dash"]');
        for (const pointerId of [191, 192]) button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, pointerType: 'touch', pointerId, button: 0, isPrimary: pointerId === 191,
        }));
    });
    await page.waitForTimeout(180);
    assert.equal(await root.getAttribute('data-mobile-actions'), 'expanded',
        'tray must not close during an action hold');
    await page.evaluate(() => {
        const button = document.querySelector('[data-mobile-actions-tray] [data-input-press="dash"]');
        button.dispatchEvent(new PointerEvent('pointerup',
            { bubbles: true, pointerType: 'touch', pointerId: 191, button: 0 }));
    });
    await page.waitForTimeout(12);
    assert.equal(await root.getAttribute('data-mobile-actions'), 'expanded',
        'first of two released fingers must not hide the second action');
    await page.evaluate(() => {
        const button = document.querySelector('[data-mobile-actions-tray] [data-input-press="dash"]');
        button.dispatchEvent(new PointerEvent('pointerup',
            { bubbles: true, pointerType: 'touch', pointerId: 192, button: 0 }));
    });
    await page.waitForFunction(() =>
        document.querySelector('[data-character-manager]')?.dataset.mobileActions === 'collapsed');
    assert.equal(await root.locator('[data-mobile-actions-tray]').getAttribute('aria-hidden'), 'true');
    report.scenarios.push({ name: 'actions-tray-hold-and-concurrent-release', status: 'passed' });

    // 320 CSS px viewport is a real production constraint on compact phones.
    // HUD, pause toolbar and critical actions must stay inside physical bounds.
    await page.setViewportSize({ width: 320, height: 568 });
    // "portrait" was already true at 390x844. Wait for the actual
    // VisualViewport/CSS logical dimensions and gameplay-control reflow,
    // not the unchanged orientation flag. This still fails for a genuine
    // permanent overflow instead of asserting stale pre-resize rectangles.
    await page.waitForFunction(() => {
        const root = document.querySelector('[data-character-manager]');
        const stick = document.querySelector('[data-virtual-stick]');
        const jump = document.querySelector('[data-control-surface="world"] [data-input-press="jump"]');
        const pause = document.querySelector('.play-toolbar [data-shell-action="pause"]');
        if (!root || !stick || !jump || !pause) return false;
        const logicalHeight = Number.parseFloat(document.documentElement.style
            .getPropertyValue('--demian-logical-height'));
        const height = window.visualViewport?.height ?? window.innerHeight;
        if (window.innerWidth > 320 || Math.abs(logicalHeight - height) > 2) return false;
        return [stick, jump, pause].every(node => {
            const rect = node.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44 &&
                rect.x >= -1 && rect.y >= -1 &&
                rect.right <= 321 && rect.bottom <= 569;
        });
    }, null, { timeout: 10000 });
    const compactStick = await getRect(stick), compactJump = await getRect(jump);
    const pause = await getRect(page.locator('.play-toolbar [data-shell-action="pause"]'));
    for (const target of [compactStick.bounds, compactJump.bounds, pause.bounds]) {
        assert.ok(within(target, 320, 568), '320px viewport target overflow: ' + JSON.stringify(target));
    }
    const statusBar = await page.locator('.mobile-status-bar').boundingBox();
    if (statusBar) assert.ok(within(statusBar, 320, 568), 'HUD overflows 320px screen');
    report.scenarios.push({ name: 'compact-320px-hud-safe-area-and-hitboxes',
        status: 'passed', statusBar, stick: compactStick.bounds, jump: compactJump.bounds, pause: pause.bounds });
    await page.screenshot({ path: resolve(output, 'compact-320.png') });
    await page.setViewportSize({ width: 390, height: 844 });

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

    // Exercise the existing CSS rotation fallback *without* modifying game
    // definitions: temporarily request landscape while the physical phone
    // is portrait. Input must remain inside the actual screen after rotate.
    await page.evaluate(() => {
        document.querySelector('[data-character-manager]').dataset.gameOrientation = 'landscape';
    });
    await page.waitForFunction(() =>
        document.querySelector('[data-character-manager]')?.dataset.forcedLandscape === 'true');
    const forcedStick = await getRect(stick), forcedAction = await getRect(jump);
    const layout = await page.evaluate(() => {
        const root = document.querySelector('[data-character-manager]');
        const stage = root.querySelector('.manager-stage');
        const rect = element => {
            const r = element?.getBoundingClientRect();
            return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        };
        return { viewport: [innerWidth, innerHeight],
            root: rect(root), stage: rect(stage),
            styles: {
                rootHeight: getComputedStyle(root).height,
                stageHeight: getComputedStyle(stage).height,
                rootTransform: getComputedStyle(root).transform,
                orientation: root.dataset.orientation,
                forced: root.dataset.forcedLandscape,
            } };
    });
    report.scenarios.push({ name: 'css-rotation-fallback-hitboxes', status: 'measured',
        stick: forcedStick.bounds, jump: forcedAction.bounds, layout });
    await page.screenshot({ path: resolve(output, 'forced-landscape.png') });
    assert.ok(within(forcedStick.bounds, 390, 844),
        'rotated stick outside physical viewport: ' + JSON.stringify({ stick: forcedStick.bounds, layout }));
    assert.ok(within(forcedAction.bounds, 390, 844),
        'rotated jump outside physical viewport: ' + JSON.stringify({ jump: forcedAction.bounds, layout }));
    report.scenarios.at(-1).status = 'passed';
    await page.evaluate(() => {
        document.querySelector('[data-character-manager]').dataset.gameOrientation = 'any';
    });
    await page.waitForFunction(() =>
        document.querySelector('[data-character-manager]')?.dataset.forcedLandscape === 'false');

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
