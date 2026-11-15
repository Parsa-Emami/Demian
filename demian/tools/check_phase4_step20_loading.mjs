/**
 * Phase 4 / Step 20 — actual built-release startup acceptance.
 *
 * CI-run Chromium is intentionally not a physical Android or iOS device.
 * No network is required to render the initial menu. Games and their optional
 * images load only on explicit selection; switching games cannot strand a
 * blocking loading screen or make a sprite/texture mandatory for the menu.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase4-step20');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build the static release first');
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw Error('invalid path');
        const file = resolve(root, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=0');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
});
const wait = (page, predicate, timeout = 45000) => page.waitForFunction(predicate, null, { timeout });
const report = {
    schema: 1, status: 'pending', physicalDeviceVerified: false,
    firstMenuMs: null, firstMenuAssetRequests: [], games: [], mobile4g: null, errors: [],
    limitations: [
        'Chromium emulation does not measure physical iOS Safari or Android Chrome startup.',
        'On-device GPU memory, PSS/RSS, energy, 15-minute thermal conditions and touch-to-photon remain external gates.',
        'Offline game packs and PWA updates are checked by Mobile-07/09 suites, not inferred from this test.',
    ],
};
let browser, context, page;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    context = await browser.newContext({ viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    // Even a completely broken character endpoint and absent sprite server
    // must not prevent the initial menu from becoming interactive.
    let menuPhase = true;
    await page.route(/\/(?:characters\.json|assets\/characters\/[^/]+\/[^/?]+(?:spritesheet|atlas)[^/?]*)/, async route => {
        if (menuPhase) {
            report.firstMenuAssetRequests.push(new URL(route.request().url()).pathname);
            await route.abort();
        } else await route.continue();
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const startedAt = Date.now();
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 20000);
    report.firstMenuMs = Date.now() - startedAt;
    menuPhase = false;
    assert.equal(report.firstMenuAssetRequests.length, 0,
        'The first menu must not request character sheets or API before selection.');
    assert.ok(report.firstMenuMs <= 12000,
        'Built-release initial menu exceeded 12s local Chromium budget: ' + report.firstMenuMs);
    assert.equal(await page.evaluate(() => window.demianGameApplication?.activeGameId), null,
        'A full Open World instance must not be created as a menu backdrop.');

    const games = ['coffee-crash', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'open-world'];
    // The image loader's optional café preview takes up to 12s on failure.
    // Delay it in the first game to verify gameplay does not await that art.
    await page.route(/\/assets\/environments\/demian-fbx\/polished-v1\/preview\.webp/, async route => {
        await new Promise(resolve => setTimeout(resolve, 7000));
        try { await route.continue(); } catch { /* navigation canceled optional art */ }
    });
    for (const game of games) {
        const start = Date.now();
        // Directly await the same public method the game launcher invokes.
        await page.evaluate(id => window.demianGameApplication.launchGame(id), game);
        await wait(page, () => window.demianGameApplication?.sessionState === 'playing');
        const elapsed = Date.now() - start;
        report.games.push({ game, firstLaunchMs: elapsed, status: 'passed' });
        if (game === 'coffee-crash') {
            assert.ok(elapsed < 6500,
                'Coffee Crash start still blocks on the deliberately delayed 7s decorative art: ' + elapsed);
        }
        assert.ok(elapsed < 45000, 'Individual game stuck in loading: ' + game + ' (' + elapsed + 'ms)');
        await page.evaluate(() => window.demianGameApplication.showMenu());
        await wait(page, () => window.demianGameApplication?.sessionState === 'menu');
        assert.equal(await page.evaluate(() => window.demianGameApplication?.activeGameId), null,
            'Game assets must be released before returning to the menu.');
    }
    // Step 20 UX acceptance on the actual optimized browser release:
    // navigation, six-game catalog, focus trapping and nested pause/settings.
    await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
    await page.locator('[data-screen="game-selection"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-game-card]').count(), 6,
        'The shared game selection must present all six current games.');
    assert.match(await page.locator('[data-game-library-count]').innerText(), /۶/,
        'The visible game count must reflect the catalog, not stale placeholder copy.');
    await page.locator('[data-screen="game-selection"] [data-shell-action="back-cafe"]').click();
    await page.locator('[data-screen="cafe-menu"]').waitFor({ state: 'visible' });
    const settingsTrigger = page.locator('[data-screen="cafe-menu"] [data-shell-action="settings"]');
    await settingsTrigger.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-screen="settings"]').waitFor({ state: 'visible' });
    await wait(page, () => {
        const settings = document.querySelector('[data-screen="settings"]');
        const menu = document.querySelector('[data-screen="cafe-menu"]');
        return settings?.dataset.screenState === 'active'
            && menu?.inert && settings.contains(document.activeElement);
    }, 10000);

    const settingsState = await page.evaluate(() => {
        const settings = document.querySelector('[data-screen="settings"]');
        const menu = document.querySelector('[data-screen="cafe-menu"]');
        return { dialogOperable: !settings?.inert,
            backgroundInert: Boolean(menu?.inert),
            initialFocusInside: Boolean(settings?.contains(document.activeElement)) };
    });
    assert.deepEqual(settingsState, {
        dialogOperable: true, backgroundInert: true, initialFocusInside: true,
    }, 'Only the active settings dialog may receive focus.');
    for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() =>
            document.querySelector('[data-screen="settings"]')?.contains(document.activeElement)), true,
            'Keyboard Tab must remain inside settings.');
    }
    await page.keyboard.press('Escape');
    await page.locator('[data-screen="settings"]').waitFor({ state: 'hidden' });
    const restoredFocus = await page.evaluate(() => ({
        activeAction: document.activeElement?.getAttribute('data-shell-action') ?? null,
        activeTag: document.activeElement?.tagName ?? null,
        menuInert: document.querySelector('[data-screen="cafe-menu"]')?.inert ?? null,
        menuHidden: document.querySelector('[data-screen="cafe-menu"]')?.hidden ?? null,
        primaryId: window.demianGameApplication?.shell?.manager?.primaryId ?? null,
        modalStack: window.demianGameApplication?.shell?.manager?.modalStack ?? null,
        openerAction: window.demianGameApplication?.shell?.settingsScreen?.returnFocusTarget
            ?.getAttribute('data-shell-action') ?? null,
    }));
    assert.equal(restoredFocus.activeAction, 'settings',
        'Closing keyboard-invoked settings must restore its opener: ' + JSON.stringify(restoredFocus));

    await page.evaluate(() => window.demianGameApplication.launchGame('dino-run'));
    await wait(page, () => window.demianGameApplication?.sessionState === 'playing');
    await page.evaluate(() => window.demianGameApplication.pauseGame());
    await page.locator('[data-screen="pause"]').waitFor({ state: 'visible' });
    await page.locator('[data-screen="pause"] [data-shell-action="settings"]').click();
    await page.locator('[data-screen="settings"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-screen="pause"]').evaluate(el => el.inert), true,
        'Covered pause dialog must not be interactable while settings is on top.');
    await page.locator('[data-screen="settings"] [data-shell-action="close-modal"]').click();
    await page.locator('[data-screen="settings"]').waitFor({ state: 'hidden' });
    await wait(page, () => document.querySelector('[data-screen="pause"]')?.inert === false, 10000);
    assert.equal(await page.locator('[data-screen="pause"]').evaluate(el => el.inert), false,
        'Pause dialog must become operable again after closing settings.');
    await page.locator('[data-screen="pause"] [data-shell-action="resume"]').click();
    await wait(page, () => window.demianGameApplication?.sessionState === 'playing', 10000);
    await page.evaluate(() => window.demianGameApplication.showMenu());
    await wait(page, () => window.demianGameApplication?.sessionState === 'menu');
    report.ux = { gameCards: 6, keyboardTrap: true, focusReturn: true, nestedPauseSettings: true };

    assert.deepEqual(report.errors, [], 'No uncaught errors in full boot/game/menu cycle.');

    // A second, genuinely cold browser has no prior sprite or JS cache.
    // Chromium CDP throttles both request latency and throughput. This is a
    // reproducible laboratory budget for *time from tap to first playable
    // game state*, not an SLA for arbitrary physical phones or 2G/3G.
    const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    try {
        const phone = await mobile.newPage();
        phone.on('pageerror', error => report.errors.push(error.message));
        const cdp = await mobile.newCDPSession(phone);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
            offline: false, latency: 80,
            downloadThroughput: 8 * 1024 * 1024 / 8,
            uploadThroughput: 2 * 1024 * 1024 / 8,
        });
        report.mobile4g = {
            emulated: true, physicalPhoneVerified: false,
            latencyMs: 80, throughputMbps: 8, launches: [],
        };
        await phone.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await wait(phone, () => window.demianGameApplication?.sessionState === 'menu', 30000);
        const requested = [];
        phone.on('request', request => {
            if (request.url().includes('/assets/characters/')) requested.push(request.url());
        });
        for (const game of ['dino-run', 'cafe-rush', 'open-world']) {
            const index = requested.length;
            const started = Date.now();
            await phone.evaluate(id => window.demianGameApplication.launchGame(id), game);
            await wait(phone, () => window.demianGameApplication?.sessionState === 'playing', 30000);
            const elapsedMs = Date.now() - started;
            const firstRequests = requested.slice(index).map(value => new URL(value).pathname);
            report.mobile4g.launches.push({ game, elapsedMs, firstRequests });
            assert.ok(firstRequests.filter(url => /-preview-v\d+\.png$/.test(url)).length <= 5,
                'Off-screen character rail must not download every poster on first launch.');
            assert.ok(firstRequests.every(url => !/-spritesheet-v\d+-(detail|runtime)\.(png|webp)$/.test(url)),
                '4G phone first paint fetched an unnecessary multi-MB atlas: ' + JSON.stringify(firstRequests));
            assert.ok(elapsedMs < 2000, '4G simulated first game launch exceeded 2s: ' + game +
                ' (' + elapsedMs + 'ms)');
            await phone.evaluate(() => window.demianGameApplication.showMenu());
            await wait(phone, () => window.demianGameApplication?.sessionState === 'menu');
        }
    } finally { await mobile.close(); }
    assert.deepEqual(report.errors, [], 'No uncaught errors in throttled 4G game cycle.');
    report.status = 'passed';
} catch (error) {
    report.errors.push(error.stack ?? String(error));
    report.status = 'failed';
} finally {
    writeFileSync(resolve(output, 'startup-and-game-loading.json'), JSON.stringify(report, null, 2) + '\n');
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 20] Initial menu / all-games startup QA failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 20] Fast startup passed:', {
        firstMenuMs: report.firstMenuMs, games: report.games,
    });
}
