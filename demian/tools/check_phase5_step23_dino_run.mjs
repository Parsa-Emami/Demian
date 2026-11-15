import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { RUNNER_CONFIG } from '../resources/js/game/games/dino-run/DinoRunModel.js';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase5-step23');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build the static release first');
mkdirSync(output, { recursive: true });

const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('invalid path');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
});
const wait = (page, predicate, timeout = 18000) => page.waitForFunction(predicate, null, { timeout });
const report = {
    schema: 1, status: 'pending', deviceTests: [], errors: [], physicalDeviceVerified: false,
    serverScoreSubmissionVerifiedInBrowser: false,
    limitations: [
        'Chromium mobile emulation does not establish physical Android or iOS Safari performance.',
        'The static release has no production API credentials; the backend proof verifier is checked independently by PHP CI.',
        'A deterministic practice-only injected obstacle is used to exercise the game-over screen, not ranked score submission.',
    ],
};
let browser;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
        headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    for (const { label, width, height, mobile } of [
        { label: 'phone-320-portrait', width: 320, height: 568, mobile: true },
        { label: 'phone-390-portrait', width: 390, height: 844, mobile: true },
        { label: 'phone-844-landscape', width: 844, height: 390, mobile: true },
        { label: 'desktop-1440', width: 1440, height: 900, mobile: false },
    ]) {
        const context = await browser.newContext({
            viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
            isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 30000);
            await page.evaluate(() => window.demianGameApplication.launchGame('dino-run', { seed: 127 }));
            await wait(page, () => window.demianGameApplication?.activeGame?.model?.status === 'ready', 35000);
            const initial = await page.evaluate(() => {
                const app = window.demianGameApplication, g = app.activeGame;
                const score = g.hud.getBoundingClientRect();
                const controls = [...document.querySelectorAll('[data-control-surface="dino-run"] button')]
                    .filter(node => node.getClientRects().length)
                    .map(node => {
                        const r = node.getBoundingClientRect();
                        return { x: r.x, y: r.y, width: r.width, height: r.height };
                    });
                return {
                    mode: g.run.mode, score: g.model.score, time: g.timeNode.textContent,
                    passed: g.passedNode.textContent, trackWidth: g.model.width,
                    screenOverflow: document.documentElement.scrollWidth > innerWidth + 2,
                    hud: { x: score.x, y: score.y, width: score.width, height: score.height },
                    controls, inputContext: app.root.dataset.inputContext,
                    controlLayout: app.root.dataset.controlLayout,
                };
            });
            assert.equal(initial.mode, 'practice');
            assert.equal(initial.score, 0);
            assert.equal(initial.inputContext, 'DINO_RUN');
            assert.equal(initial.controlLayout, 'dino-run');
            assert.equal(initial.screenOverflow, false);
            assert.equal(initial.time, new Intl.NumberFormat('fa-IR').format(0));
            assert.equal(initial.passed, new Intl.NumberFormat('fa-IR').format(0));
            assert.ok(initial.hud.x >= -1 && initial.hud.x + initial.hud.width <= width + 2
                && initial.hud.y >= -1 && initial.hud.y + initial.hud.height <= height + 2);
            if (mobile) {
                assert.equal(initial.controls.length, 2);
                for (const control of initial.controls) {
                    assert.ok(control.width >= 44 && control.height >= 44);
                    assert.ok(control.x >= -1 && control.y >= -1
                        && control.x + control.width <= width + 2
                        && control.y + control.height <= height + 2);
                }
            }
            if (mobile) {
                await page.locator('.runner-ready [data-input-press="jump"]').tap();
            } else {
                await page.keyboard.press('Space');
            }
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'running', 10000);
            await wait(page, () => window.demianGameApplication.activeGame.model.time > .2, 10000);
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                if (g.run.mode !== 'practice') throw Error('QA may only isolate practice gameplay');
                g.model.spawnIn = Infinity;
                g.model.obstacles = [];
            });
            await wait(page, () => {
                const g = window.demianGameApplication.activeGame;
                return g.model.y === 0 && g.model.vy === 0;
            }, 10000);
            await wait(page, () => {
                const g = window.demianGameApplication.activeGame;
                return Number(g.model.score) > 0
                    && g.scoreNode.textContent === new Intl.NumberFormat('fa-IR', {
                        useGrouping: false, minimumIntegerDigits: 5,
                    }).format(g.model.score)
                    && g.timeNode.textContent === new Intl.NumberFormat('fa-IR').format(Math.floor(g.model.time));
            }, 10000);
            if (mobile) {
                const duck = page.locator('.runner-controls__duck');
                const rect = await duck.boundingBox();
                if (!rect) {
                    const debug = await page.evaluate(() => {
                        const app = window.demianGameApplication;
                        const button = document.querySelector('.runner-controls__duck');
                        const surface = button?.closest('[data-control-surface]');
                        return {
                            sessionState: app.sessionState, modelStatus: app.activeGame?.model?.status,
                            activeGameId: app.activeGameId,
                            controlLayout: app.root.dataset.controlLayout,
                            inputContext: app.root.dataset.inputContext,
                            surfaceDisplay: surface ? getComputedStyle(surface).display : null,
                            surfaceVisibility: surface ? getComputedStyle(surface).visibility : null,
                            buttonDisplay: button ? getComputedStyle(button).display : null,
                            buttonVisibility: button ? getComputedStyle(button).visibility : null,
                            sidebarState: app.root.dataset.sidebarState,
                            buttonCount: document.querySelectorAll('.runner-controls__duck').length,
                        };
                    });
                    throw new Error('Runner duck button has no layout box: ' + JSON.stringify(debug));
                }
                const touch = await context.newCDPSession(page);
                const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
                await touch.send('Input.dispatchTouchEvent', {
                    type: 'touchStart', touchPoints: [{ x, y }],
                });
                await wait(page, () => window.demianGameApplication.activeGame.model.duck === true, 10000);
                await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            } else {
                await page.keyboard.down('ArrowDown');
                await wait(page, () => window.demianGameApplication.activeGame.model.duck === true, 10000);
                await page.keyboard.up('ArrowDown');
            }
            await wait(page, () => !window.demianGameApplication.activeGame.model.duck, 10000);
            await page.keyboard.down('Space');
            await wait(page, () => window.demianGameApplication.activeGame.model.y > 5, 10000);
            await page.keyboard.up('Space');
            await page.evaluate(() => window.demianGameApplication.pauseGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'paused', 10000);
            const frozen = await page.evaluate(() => window.demianGameApplication.activeGame.model.time);
            await page.waitForTimeout(130);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.time), frozen,
                'Game time must freeze during pause');
            await page.evaluate(() => window.demianGameApplication.resumeGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'playing', 10000);
            await page.waitForFunction(
                elapsed => window.demianGameApplication.activeGame.model.time > elapsed,
                frozen, { timeout: 10000 },
            );
            await wait(page, () => window.demianGameApplication.activeGame.model.y === 0, 10000);
            await page.evaluate((playerX) => {
                const g = window.demianGameApplication.activeGame;
                if (g.run.mode !== 'practice') throw Error('QA collision only permitted in practice');
                g.model.spawnIn = Infinity;
                g.model.obstacles = [{
                    id: 9999, type: 'cactus', response: 'jump', appearance: 'coffee-crate',
                    x: playerX + 8, previousX: playerX + 8, y: 0, w: 32, h: 38,
                    scored: false, attacker: null,
                }];
            }, RUNNER_CONFIG.playerX);
            await wait(page, () => window.demianGameApplication?.sessionState === 'results', 10000);
            await page.locator('[data-screen="results"]').waitFor({ state: 'visible', timeout: 10000 });
            const final = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return {
                    score: g.model.score, passed: g.model.passed, tick: g.model.tick,
                    endReason: g.model.endReason, replayTicks: g.replay.ticks,
                    finished: g.finished,
                };
            });
            assert.equal(final.endReason, 'collision');
            assert.equal(final.finished, true);
            assert.ok(final.score > 0 && final.replayTicks > 0 && final.tick > 0);
            await page.waitForTimeout(110);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.score),
                final.score, 'Score must stay frozen after the results screen');
            if (label === 'phone-390-portrait') {
                await page.screenshot({
                    path: resolve(output, 'dino-run-390-results.png'), animations: 'disabled',
                });
            }
            await page.locator('[data-screen="results"] [data-shell-action="restart"]').click();
            await wait(page, () => window.demianGameApplication?.activeGame?.model?.status === 'ready', 35000);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.score), 0);
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await wait(page, () => window.demianGameApplication.sessionState === 'menu', 15000);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGameId), null);
            assert.deepEqual(errors, [], 'Browser must not report an unhandled error');
            report.deviceTests.push({
                label, width, height, mobileEmulated: mobile, status: 'passed',
                controls: mobile ? 'touch + keyboard' : 'keyboard',
                runMode: initial.mode, serverSubmitted: false,
                score: final.score, replayTicks: final.replayTicks, trackWidth: initial.trackWidth,
                pauseFrozen: true, restartReset: true, inputContext: initial.inputContext,
            });
        } finally {
            await context.close();
        }
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'dino-run-browser.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 23] Dino Run browser acceptance failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 23] Dino Run browser acceptance passed:', report.deviceTests);
}
