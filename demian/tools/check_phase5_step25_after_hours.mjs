import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase5-step25');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build the static export before Step 25 browser QA');
mkdirSync(output, { recursive: true });

const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('Invalid path');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
});
const report = {
    schema: 1, status: 'pending', views: [], errors: [],
    emulatedDevices: true, physicalDeviceVerified: false, liveApiScoreVerified: false,
    limits: [
        'Real Android/iOS touch latency, lighting readability and 30-minute soak require physical devices.',
        'This browser test runs practice mode only and cannot authorize server-verified prizes.',
        'Verified game evidence and score are independently checked by the PHP replay API CI suite.',
        '50-user concurrent host load and independent fraud testing remain release gates.',
    ],
};
const wait = (page, check, timeout = 15000) => page.waitForFunction(check, null, { timeout });
let browser;
try {
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
        headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    const devices = [
        { label: 'mobile-320-portrait', width: 320, height: 568, mobile: true },
        { label: 'mobile-390-portrait', width: 390, height: 844, mobile: true },
        { label: 'mobile-844-landscape', width: 844, height: 390, mobile: true },
        { label: 'desktop-1440', width: 1440, height: 900, mobile: false },
    ];
    for (const { label, width, height, mobile } of devices) {
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
            await page.evaluate(() => window.demianGameApplication.launchGame('after-hours', { seed: 127 }));
            await wait(page, () => {
                const app = window.demianGameApplication;
                return app?.activeGame?.model?.status === 'ready'
                    && app.activeGame.ui?.dialog?.open === true;
            }, 35000);

            const entry = await page.evaluate(() => {
                const app = window.demianGameApplication, g = app.activeGame;
                return {
                    input: app.root.dataset.inputContext,
                    layout: app.root.dataset.controlLayout,
                    modal: g.ui.view,
                    selected: g.ui.difficulty,
                    time: g.model.remaining,
                    cards: g.model.cardCount,
                    shadow: g.model.shadow.mode,
                    overflow: document.documentElement.scrollWidth > innerWidth + 2,
                    choices: [...g.ui.choices].map(x => ({
                        name: x.dataset.shiftChoice, width: x.getBoundingClientRect().width,
                        height: x.getBoundingClientRect().height,
                    })),
                };
            });
            assert.equal(entry.modal, 'entry');
            assert.equal(entry.time, 300);
            assert.equal(entry.cards, 0);
            assert.equal(entry.shadow, 'patrol');
            assert.equal(entry.overflow, false);
            assert.deepEqual(entry.choices.map(c => c.name), ['standard', 'hard']);
            assert.ok(entry.choices.every(c => c.height >= 44), 'Difficulty controls need touch-size targets');
            assert.ok(['MENU', 'AFTER_HOURS'].includes(entry.input));

            await page.locator('[data-shift-choice="hard"]').click();
            await page.locator('[data-shift-action="confirm"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'running');
            const started = await page.evaluate(() => {
                const app = window.demianGameApplication, g = app.activeGame;
                return { time: g.model.remaining, difficulty: g.model.difficulty,
                    dialog: g.ui.dialog.open, context: app.root.dataset.inputContext,
                    challenge: g.gameplayChallenge.state,
                    position: { ...g.model.player.position } };
            });
            assert.equal(started.difficulty, 'hard');
            assert.equal(started.dialog, false);
            assert.equal(started.challenge, 'idle');
            assert.equal(started.context, 'AFTER_HOURS');
            assert.ok(started.time <= 240 && started.time > 239,
                'The first 60Hz frame may already have elapsed after closing the entry dialog');

            const collapsedInset = await page.evaluate(() => window.demianGameApplication.activeGame.renderer.scene.camera.insetTop);
            assert.ok(collapsedInset > 0);
            await page.locator('.shift-hud .game-readout__details > summary').click();
            await page.waitForFunction(inset => window.demianGameApplication.activeGame.renderer.scene.camera.insetTop > inset,
                collapsedInset, { timeout: 3000 });
            await page.locator('.shift-hud .game-readout__details > summary').click();
            await page.waitForFunction(inset => Math.abs(window.demianGameApplication.activeGame.renderer.scene.camera.insetTop - inset) < 2,
                collapsedInset, { timeout: 3000 });

            await page.keyboard.down('ArrowLeft');
            await page.waitForTimeout(320);
            await page.keyboard.up('ArrowLeft');
            await wait(page, () => window.demianGameApplication.activeGame.model.elapsed > 0.1);
            const moved = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const p = g.model.player.position;
                return { travelled: Math.hypot(p.x + 1.2, p.z + 6.5), elapsed: g.model.elapsed };
            });
            assert.ok(moved.travelled > 0.05, 'Real keyboard input should move the character');

            await page.evaluate(() => window.demianGameApplication.pauseGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'paused');
            const pausedAt = await page.evaluate(() => window.demianGameApplication.activeGame.model.elapsed);
            await page.waitForTimeout(120);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.elapsed),
                pausedAt, 'Paused game must freeze the simulation clock');
            await page.evaluate(() => window.demianGameApplication.resumeGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'playing');

            // Test-only teleports exercise the UI lifecycle; actual traversable
            // routes, collision and parity are asserted by the JS/PHP suites.
            // Do not use a ranked run, fabricate a score, or call any online API.
            const openedPower = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                if (g.gameplayChallenge.state !== 'idle') throw Error('Never manipulate ranked gameplay');
                const p = { x: 2.9, z: -9 };
                g.model.terrain.reset('player', p);
                g.model.player.position = p;
                g.fixedUpdate(1 / 60, { interact: true });
                return { view: g.ui.view, open: g.ui.dialog.open };
            });
            assert.deepEqual(openedPower, { view: 'power', open: true });
            await page.locator('[data-shift-switch="exit"]').click();
            assert.equal(await page.evaluate(() =>
                window.demianGameApplication.activeGame.model.darkCircuit), 'exit');

            const lockState = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                function interactAt(target) {
                    const p = { x: target.x, z: target.z };
                    g.model.terrain.reset('player', p);
                    g.model.player.position = p;
                    g.fixedUpdate(1 / 60, { interact: true });
                }
                interactAt(g.model.cards[0]);
                interactAt(g.model.cards[1]);
                interactAt({ x: .4, z: -3.9 });
                return { cards: g.model.cardCount, status: g.model.status,
                    dark: g.model.darkCircuit, exitReady: g.model.exitReady };
            });
            assert.deepEqual(lockState, {
                cards: 2, status: 'running', dark: 'exit', exitReady: false,
            }, 'Locked unpowered exit must never finish the shift');

            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const p = { x: 2.9, z: -9 };
                g.model.terrain.reset('player', p);
                g.model.player.position = p;
                g.fixedUpdate(1 / 60, { interact: true });
            });
            await wait(page, () => window.demianGameApplication.activeGame.ui.view === 'power');
            const invalid = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                g.handleDialog('power', 'not-a-circuit');
                return { open: g.ui.dialog.open, dark: g.model.darkCircuit, view: g.ui.view };
            });
            assert.deepEqual(invalid, { open: true, dark: 'exit', view: 'power' },
                'Invalid power action must not silently dismiss the dialog');
            await page.locator('[data-shift-switch="storage"]').click();
            assert.equal(await page.evaluate(() =>
                window.demianGameApplication.activeGame.model.darkCircuit), 'storage');
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const p = { x: .4, z: -3.9 };
                g.model.terrain.reset('player', p);
                g.model.player.position = p;
                g.fixedUpdate(1 / 60, { interact: true });
            });
            await wait(page, () => window.demianGameApplication.sessionState === 'results', 15000);
            const win = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const r = g.model.result();
                return { won: r.won, score: r.score, cards: r.cards, reason: r.reason,
                    challenge: g.gameplayChallenge.state,
                    best: JSON.parse(localStorage.getItem('demian.after-hours.v1.best.hard') || 'null') };
            });
            assert.equal(win.won, true);
            assert.equal(win.cards, 2);
            assert.equal(win.reason, 'escaped');
            assert.ok(win.score >= 1000 && win.score < 2000);
            assert.equal(win.best?.score, win.score);
            assert.equal(win.challenge, 'idle');
            assert.equal(await page.locator('[data-results-score-label]').innerText(), 'زمان خروج');
            assert.match(await page.locator('[data-results-score]').innerText(), /[۰-۹]{2}:[۰-۹]{2}/);

            if (label === 'mobile-390-portrait') {
                await page.screenshot({
                    path: resolve(output, 'after-hours-390-results.png'), animations: 'disabled',
                });
            }
            await page.locator('[data-screen="results"] [data-shell-action="restart"]').click();
            await wait(page, () => window.demianGameApplication?.activeGame?.model?.status === 'ready', 35000);
            const restart = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { remaining: g.model.remaining, cards: g.model.cardCount,
                    modal: g.ui.dialog.open, challenge: g.gameplayChallenge.state };
            });
            assert.equal(restart.remaining, 240);
            assert.equal(restart.cards, 0);
            assert.equal(restart.modal, true);
            assert.equal(restart.challenge, 'idle');

            await page.locator('[data-shift-action="confirm"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'running');
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                g.model.elapsed = g.model.rules.duration - 0.005;
                g.fixedUpdate(1 / 60, {});
            });
            await wait(page, () => window.demianGameApplication.sessionState === 'results');
            assert.deepEqual(await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { won: g.model.result().won, reason: g.model.result().reason,
                    remaining: g.model.remaining };
            }), { won: false, reason: 'timeout', remaining: 0 });

            await page.evaluate(() => window.demianGameApplication.showMenu());
            await wait(page, () => window.demianGameApplication.sessionState === 'menu', 18000);
            await wait(page, () => !document.querySelector('.shift-dialog'));
            assert.deepEqual(errors, [], 'No uncaught browser runtime errors');
            report.views.push({
                label, viewport: [width, height], emulatedTouch: mobile,
                status: 'passed', selectedDifficulty: started.difficulty,
                keyboardMovement: moved.travelled, pauseClockFrozen: true,
                cards: win.cards, validEscapeScore: win.score,
                invalidPowerRetained: invalid.open, restartReset: true,
                timeoutTerminal: true, runtimeErrors: errors.length,
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
    writeFileSync(resolve(output, 'after-hours-browser.json'),
        JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 25] After Hours browser QA failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 25] After Hours browser QA passed:', report.views);
}
