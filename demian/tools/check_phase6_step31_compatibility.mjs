/**
 * Phase 6 / Step 31 — actual built-release, cross-engine E2E acceptance.
 * Desktop Firefox/WebKit engines running on Linux are NOT proof of real
 * Android/iOS devices, thermal soak or production CDN latency.
 */
import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { GAME_IDS } from './qa/step31_quality_policy.mjs';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase6-step31');
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
    try {
        const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (p.includes('\\') || p.split('/').includes('..')) throw Error('Unsafe path');
        const path = resolve(root, p.replace(/^\/+/, '') || 'index.html');
        if (!path.startsWith(root + sep) || !statSync(path).isFile()) throw Error('Missing asset');
        res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
        createReadStream(path).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
});
const wait = (page, predicate, timeout = 35000, arg = null) => page.waitForFunction(predicate, arg, { timeout });
const report = { schema: 1, step: 31, status: 'pending', emulatedDevices: true,
    physicalDeviceVerified: false, realApiVerified: false, browsers: [], errors: [],
    caveats: [
        'Linux Chromium/Firefox/WebKit is cross-engine smoke, not physical Android/iOS Safari.',
        'Practice-only arcade mode: no real API, prize, voucher or ranked score transaction.',
        'Real 15-30 min thermal soak and staging 50 concurrent users remain external release gates.',
    ],
};
let runtime = null;
try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const { chromium, firefox, webkit } = await import('playwright');
    const origin = 'http://127.0.0.1:' + server.address().port + '/';
    for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
        const browserReport = { engine, status: 'pending', games: [], errors: [],
            viewport: '390x844 mobile-style', offlineRecovery: false, keyboardAccessible: false };
        report.browsers.push(browserReport);
        let context;
        try {
            runtime = await browserType.launch({ headless: true,
                ...(engine === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
            context = await runtime.newContext({
                viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
                hasTouch: true, serviceWorkers: 'block',
                ...(engine === 'firefox' ? {} : { isMobile: true }),
            });
            const page = await context.newPage();
            page.on('pageerror', error => browserReport.errors.push(error.message));
            const started = Date.now();
            await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu');
            await page.evaluate(() => {
                window.__step31LaunchErrors = [];
                window.__step31Clicks = [];
                document.addEventListener('click', event => {
                    const button = event.target.closest?.('[data-game-launch]');
                    if (button) window.__step31Clicks.push(button.dataset.gameLaunch);
                }, true);
                window.demianGameApplication.eventBus.on('game:load-failed', ({gameId, error}) => {
                    window.__step31LaunchErrors.push({ gameId, message: String(error?.stack ?? error) });
                });
                // GameShell deliberately catches launchGame rejections. Capture
                // those at the public method boundary too: a startSession()
                // exception can occur after performGameSwitch() succeeds and
                // therefore never emit the narrower game:load-failed event.
                const app = window.demianGameApplication;
                const launch = app.launchGame;
                app.launchGame = function (...args) {
                    return launch.apply(this, args).catch(error => {
                        window.__step31LaunchErrors.push({
                            gameId: args[0], message: String(error?.stack ?? error),
                        });
                        throw error;
                    });
                };
            });
            browserReport.menuHydrationMs = Date.now() - started;
            assert.ok(browserReport.menuHydrationMs < 15000,
                engine + ' cold menu hydration >15s emulated lab bound');
            const first = page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]');
            await first.focus();
            await page.keyboard.press('Enter');
            await page.locator('[data-screen="game-selection"]').waitFor({ state: 'visible' });
            assert.equal(await page.locator('[data-game-card]').count(), GAME_IDS.length);
            browserReport.keyboardAccessible = true;
            for (const game of GAME_IDS) {
                const beginning = Date.now();
                // Exercise the same shell public route, real loading screen,
                // game-specific preload, session begin, and return path.
                // Scroll via the same native RTL rail controller that the
                // previous/next buttons use. Wait for scroll-snap to settle
                // before sending a real pointer click: Playwright's implicit
                // scrollIntoView is not equivalent in Firefox RTL layouts.
                await page.evaluate(id => {
                    const rail = window.demianGameApplication.shell.selectionScreen.rail;
                    const index = rail.items.findIndex(card => card.dataset.gameCard === id);
                    if (index < 0 || !rail.scrollTo(index, { behavior: 'auto' })) {
                        throw Error('Cannot navigate RTL game library to ' + id);
                    }
                }, game);
                const button = page.locator('[data-screen="game-selection"] [data-game-launch="' + game + '"]');
                // On 390px layouts CSS switches the rail to a vertical grid;
                // wait until the full button is on-screen and its center is
                // hittable, avoiding mobile WebKit cancelling a tap mid-scroll.
                await page.waitForFunction(id => {
                    const node = document.querySelector('[data-screen="game-selection"] [data-game-launch="' + id + '"]');
                    if (!node) return false;
                    const bounds = node.getBoundingClientRect();
                    const x = bounds.left + bounds.width / 2;
                    const y = bounds.top + bounds.height / 2;
                    const hit = document.elementFromPoint(x, y);
                    return bounds.width > 25 && bounds.height > 25
                        && y >= 2 && y < innerHeight - 2
                        && x >= 2 && x < innerWidth - 2
                        && Boolean(hit) && (node === hit || node.contains(hit));
                }, game, { timeout: 8000 });
                await page.waitForTimeout(280);
                await button.click();
                const clickEvidence = await page.evaluate(id => {
                    const button = document.querySelector('[data-screen="game-selection"] [data-game-launch="' + id + '"]');
                    const rect = button?.getBoundingClientRect();
                    return {
                        eventDelivered: window.__step31Clicks?.includes(id),
                        pointer: rect ? {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2} : null,
                        allClicks: window.__step31Clicks,
                        scrollTop: document.querySelector('[data-screen="game-selection"] .shell-page')?.scrollTop,
                    };
                }, game);
                assert.equal(clickEvidence.eventDelivered, true,
                    engine + '/' + game + ' pointer click was not dispatched: ' + JSON.stringify(clickEvidence));
                await wait(page, id => {
                    const app = window.demianGameApplication;
                    return (app?.activeGameId === id && app.sessionState === 'playing')
                        || (window.__step31LaunchErrors ?? []).some(row => row.gameId === id);
                }, 40000, game).catch(async () => {
                    const snap = await page.evaluate(() => ({
                        state: window.demianGameApplication?.sessionState,
                        game: window.demianGameApplication?.activeGameId,
                        loadErrors: window.__step31LaunchErrors ?? [],
                        clicked: window.__step31Clicks ?? [],
                        shell: window.demianGameApplication?.shell?.manager?.primaryId ?? null,
                    }));
                    throw Error('Never reached playing for ' + engine + '/' + game + ': ' + JSON.stringify(snap));
                });
                const failedGame = await page.evaluate(id => {
                    const app = window.demianGameApplication;
                    return (window.__step31LaunchErrors ?? []).filter(row => row.gameId === id)
                        .concat(app?.sessionState !== 'playing' ? [{
                            gameId: id, message: 'Session state = ' + app?.sessionState,
                        }] : []);
                }, game);
                assert.deepEqual(failedGame, [], engine + '/' + game + ' launch failed');
                const elapsedMs = Date.now() - beginning;
                const layout = await page.evaluate(() => ({
                    visible: !document.querySelector('[data-game-shell]')?.hidden,
                    overflow: document.documentElement.scrollWidth > window.innerWidth + 3,
                }));
                assert.equal(layout.overflow, false, engine + '/' + game + ' has horizontal overflow.');
                assert.ok(elapsedMs < 15000, engine + '/' + game + ' exceeded 15s compatibility bound.');
                browserReport.games.push({ game, elapsedMs, status: 'passed' });
                await page.evaluate(() => window.demianGameApplication.showMenu());
                await wait(page, () => window.demianGameApplication?.sessionState === 'menu');
                await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
                await page.locator('[data-screen="game-selection"]').waitFor({ state: 'visible' });
            }
            // Single session disconnected, then reconnected: a cached,
            // self-contained minigame must remain playable without inventing
            // a verified server score.
            await context.setOffline(true);
            await page.locator('[data-screen="game-selection"] [data-game-launch="cafe-critters"]').click();
            await wait(page, () => window.demianGameApplication?.activeGameId === 'cafe-critters'
                && window.demianGameApplication?.sessionState === 'playing');
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame?.rankRun ?? null),
                null, 'Offline compatibility must not invent a verified ranked run');
            await context.setOffline(false);
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu');
            browserReport.offlineRecovery = true;
            assert.deepEqual(browserReport.errors, [], 'Uncaught JavaScript errors in ' + engine);
            browserReport.status = 'passed';
        } catch (e) {
            browserReport.status = 'failed';
            browserReport.errors.push(e.stack ?? String(e));
            report.errors.push(engine + ': ' + String(e.message ?? e));
            break;
        } finally {
            await context?.close().catch(() => undefined);
            await runtime?.close().catch(() => undefined);
            runtime = null;
        }
    }
    if (report.browsers.length === 3 && report.browsers.every(b => b.status === 'passed')) {
        report.status = 'passed';
    } else report.status = 'failed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'browser-compatibility.json'), JSON.stringify(report, null, 2) + '\n');
    await runtime?.close().catch(() => undefined);
    if (server.listening) await new Promise(done => server.close(done));
}
if (report.status !== 'passed') {
    console.error('[Step 31] Cross-engine QA failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 31] Browser compatibility passed:',
        report.browsers.map(b => ({ engine: b.engine, games: b.games.length,
            menuMs: b.menuHydrationMs, offline: b.offlineRecovery })));
}
