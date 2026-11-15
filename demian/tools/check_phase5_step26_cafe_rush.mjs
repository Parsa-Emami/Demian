import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase5-step26');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build static release before Step 26 browser QA');
mkdirSync(output, { recursive: true });
const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
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
const wait = (page, predicate, timeout = 15000) => page.waitForFunction(predicate, null, { timeout });
const report = {
    schema: 1, status: 'pending', environments: [], errors: [],
    emulatedDevices: true, physicalDeviceVerified: false, realApiSubmissionVerified: false,
    limitations: [
        'Chromium mobile emulation is not a physical Android or iOS Safari device.',
        'Browser scenarios are isolated practice-only acceptance, not ranked or prize proof.',
        'PHP replay verifier parity is independently exercised in SQLite/MySQL CI.',
        'Real HTTPS API, 50 concurrent clients, device performance, fraud review and production UAT are outstanding.',
    ],
};
let browser;
try {
    await new Promise(ready => server.listen(0, '127.0.0.1', ready));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
        headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    for (const { label, width, height, mobile } of [
        { label: 'mobile-320-portrait', width: 320, height: 568, mobile: true },
        { label: 'mobile-390-portrait', width: 390, height: 844, mobile: true },
        { label: 'mobile-844-landscape', width: 844, height: 390, mobile: true },
        { label: 'desktop-1440', width: 1440, height: 900, mobile: false },
    ]) {
        const context = await browser.newContext({
            viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
            isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            const pageErrors = [];
            page.on('pageerror', error => pageErrors.push(error.message));
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 30000);
            await page.evaluate(() => window.demianGameApplication.launchGame('cafe-rush', { seed: 31 }));
            await wait(page, () => {
                const g = window.demianGameApplication?.activeGame;
                return g?.model?.status === 'ready' && g.ui?.view === 'entry' && g.ui?.dialog.open;
            }, 35000);
            const initial = await page.evaluate(() => {
                const app = window.demianGameApplication, g = app.activeGame;
                return {
                    context: app.root.dataset.inputContext, layout: app.root.dataset.controlLayout,
                    time: g.model.remaining, orders: g.model.orders.length,
                    score: g.model.score, dialog: g.ui.view,
                    levels: g.ui.choices.map(b => ({
                        id: b.dataset.rushChoice, height: b.getBoundingClientRect().height,
                    })),
                    overflow: document.documentElement.scrollWidth > innerWidth + 2,
                };
            });
            assert.equal(initial.time, 120);
            assert.equal(initial.orders, 0);
            assert.equal(initial.score, 0);
            assert.equal(initial.dialog, 'entry');
            assert.equal(initial.overflow, false, 'No horizontal scroll overflow');
            assert.deepEqual(initial.levels.map(x => x.id), ['easy', 'standard', 'hard']);
            assert.ok(initial.levels.every(x => x.height >= 44),
                'Difficulty controls must be at least 44 CSS pixels high');

            await page.locator('[data-rush-choice="hard"]').click();
            await page.locator('[data-rush-action="confirm"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'running');
            const active = await page.evaluate(() => {
                const app = window.demianGameApplication, g = app.activeGame;
                return {
                    difficulty: g.model.difficulty, capacity: g.model.rules.capacity,
                    quota: g.model.rules.quota,
                    orders: g.model.orders.length, context: app.root.dataset.inputContext,
                    layout: app.root.dataset.controlLayout, ranked: g.gameplayChallenge.state,
                };
            });
            assert.equal(active.difficulty, 'hard');
            assert.equal(active.capacity, 3);
            assert.equal(active.quota, 8);
            assert.equal(active.orders, 1, 'One real order should arrive immediately on shift start');
            assert.equal(active.context, 'CAFE_RUSH');
            assert.equal(active.layout, 'cafe-rush');
            assert.equal(active.ranked, 'idle');

            await page.keyboard.down('ArrowLeft');
            await page.waitForTimeout(290);
            await page.keyboard.up('ArrowLeft');
            const distance = await page.evaluate(() => {
                const p = window.demianGameApplication.activeGame.model.player.position;
                return Math.hypot(p.x + .35, p.z + 25.3);
            });
            assert.ok(distance > .05, 'Physical keyboard event must move the player');

            await page.evaluate(() => window.demianGameApplication.pauseGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'paused');
            const frozen = await page.evaluate(() => window.demianGameApplication.activeGame.model.elapsed);
            await page.waitForTimeout(150);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.elapsed),
                frozen, 'Pause must freeze fixed-step game time');
            await page.evaluate(() => window.demianGameApplication.resumeGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'playing');

            const acceptance = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame, m = g.model;
                if (g.gameplayChallenge.state !== 'idle') throw Error('Browser QA may only modify practice mode');
                const locations = new Map([
                    ['tickets', { x: -.1, z: -26.35 }],
                    ['bar', { x: 2.95, z: -31.15 }],
                    ['pastry', { x: 2.6, z: -22.25 }],
                    ['table-1', { x: -2.35, z: -16.9 }],
                    ['table-2', { x: -2.9, z: -43.4 }],
                ]);
                const interactAt = id => {
                    const p = locations.get(id);
                    if (!p) throw Error('Unknown practice location');
                    m.ground.reset('player', p);
                    m.player.position = { ...p };
                    m.player.speed = 0;
                    m.velocity = { x: 0, z: 0 };
                    g.fixedUpdate(1 / 60, { interact: true });
                };
                interactAt('tickets');
                const order = m.orders.find(o => o.state === 'accepted');
                if (!order) throw Error('Ticket was not accepted');
                const station = order.recipe === 'cake' ? 'pastry' : 'bar';
                const other = station === 'bar' ? 'pastry' : 'bar';
                interactAt(other);
                const wrongStationIgnored = order.state === 'accepted';
                interactAt(station);
                const startedPrep = order.state === 'preparing';
                let ticks = 0;
                while (order.state === 'preparing' && ticks++ < 220) m.advance(1 / 60);
                const ready = order.state === 'ready';
                interactAt(station);
                const tray = m.carriedOrder?.id === order.id;
                g.ui.update(m, g.notice);
                const trayHud = !g.ui.nodes.tray.hidden
                    && g.ui.nodes.destination.textContent.includes('میز');
                interactAt('table-' + (order.table === 1 ? 2 : 1));
                const wrongTableRetainsTray = m.carriedOrder?.id === order.id
                    && m.mistakes === 1 && m.score === 0;
                interactAt('table-' + order.table);
                const delivered = m.delivered, score = m.score, combo = m.combo;
                const replayIsolated = g.gameplayChallenge.state === 'idle';
                g.ui.update(m, g.notice);
                const hudScore = g.ui.nodes.score.textContent;
                return {
                    wrongStationIgnored, startedPrep, ready, tray, trayHud,
                    wrongTableRetainsTray, delivered, score, combo,
                    hudScore, replayIsolated, recipe: order.recipe, table: order.table,
                };
            });
            assert.equal(acceptance.wrongStationIgnored, true);
            assert.equal(acceptance.startedPrep, true);
            assert.equal(acceptance.ready, true);
            assert.equal(acceptance.tray, true);
            assert.equal(acceptance.trayHud, true);
            assert.equal(acceptance.wrongTableRetainsTray, true);
            assert.equal(acceptance.delivered, 1);
            assert.equal(acceptance.score, 100);
            assert.equal(acceptance.combo, 1);
            assert.equal(acceptance.hudScore, new Intl.NumberFormat('fa-IR').format(100));
            assert.equal(acceptance.replayIsolated, true);

            const concurrency = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame, m = g.model;
                let ticks = 0;
                while (m.elapsed < 18 && ticks++ < 1500) m.advance(1 / 60);
                g.ui.update(m, g.notice);
                return {
                    capacity: m.rules.capacity, activeOrders: m.orders.length,
                    orderIds: m.orders.map(o => o.id),
                    visibleTickets: g.ui.nodes.tickets.querySelectorAll('[data-rush-ticket]').length,
                };
            });
            assert.ok(concurrency.activeOrders >= 2, 'Multiple real customer orders should overlap');
            assert.ok(concurrency.activeOrders <= concurrency.capacity, 'Queue capacity is a strict bound');
            assert.equal(new Set(concurrency.orderIds).size, concurrency.activeOrders);
            assert.equal(concurrency.visibleTickets, concurrency.activeOrders);

            // Jumping to the late shift is a practice-only, isolated UI probe.
            // Actual 7200-tick schedules and VIP parity are covered in JS and PHP suites.
            const vip = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame, m = g.model;
                if (g.gameplayChallenge.state !== 'idle') throw Error('Never fabricate ranked evidence');
                m.orders = [];
                m.tray = null;
                m.elapsed = 90 - 0.005;
                m.advance(1 / 60);
                g.ui.update(m, g.notice);
                const order = m.orders.find(o => o.vip);
                return {
                    issued: Boolean(order), table: order?.table, recipe: order?.recipe,
                    capacity: m.rules.capacity, count: m.orders.length,
                    visible: g.ui.nodes.tickets.querySelectorAll('[data-rush-ticket]').length,
                };
            });
            assert.equal(vip.issued, true);
            assert.equal(vip.table, 2);
            assert.equal(vip.recipe, 'vip');
            assert.ok(vip.count <= vip.capacity);
            assert.equal(vip.visible, vip.count);

            const vipService = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame, m = g.model;
                const locations = {
                    tickets: { x: -.1, z: -26.35 },
                    bar: { x: 2.95, z: -31.15 },
                    'table-2': { x: -2.9, z: -43.4 },
                };
                const doAt = id => {
                    const p = locations[id];
                    m.ground.reset('player', p);
                    m.player.position = { ...p };
                    m.velocity = { x: 0, z: 0 };
                    m.player.speed = 0;
                    g.fixedUpdate(1 / 60, { interact: true });
                };
                const before = m.score;
                doAt('tickets');
                doAt('bar');
                let ticks = 0;
                const order = m.orders.find(o => o.vip);
                while (order.state === 'preparing' && ticks++ < 250) m.advance(1 / 60);
                if (order.state !== 'ready') throw Error('VIP food was not prepared');
                doAt('bar');
                if (m.carriedOrder?.id !== order.id) throw Error('VIP tray not collected');
                doAt('table-2');
                g.ui.update(m, g.notice);
                return { increment: m.score - before, vipServed: m.vipServed,
                    delivered: m.delivered, combo: m.combo };
            });
            assert.equal(vipService.increment, 175);
            assert.equal(vipService.vipServed, true);
            assert.equal(vipService.delivered, 2);

            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                if (g.gameplayChallenge.state !== 'idle') throw Error('Practice-only terminal probe');
                g.model.elapsed = 120 - .005;
                g.fixedUpdate(1 / 60, {});
            });
            await wait(page, () => window.demianGameApplication.sessionState === 'results');
            const result = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame, r = g.model.result();
                return {
                    score: r.score, delivered: r.delivered, quota: r.quota,
                    vip: r.vipServed, won: r.won, status: g.model.status,
                    ranked: g.gameplayChallenge.state,
                    localBest: localStorage.getItem('demian.cafe-rush.v1.best.hard'),
                };
            });
            assert.equal(result.delivered, 2);
            assert.equal(result.score, 275);
            assert.equal(result.won, false);
            assert.equal(result.status, 'finished');
            assert.equal(result.localBest, '275');
            assert.equal(result.ranked, 'idle');

            if (label === 'mobile-390-portrait') await page.screenshot({
                path: resolve(output, 'cafe-rush-390-results.png'), animations: 'disabled',
            });

            await page.locator('[data-screen="results"] [data-shell-action="restart"]').click();
            await wait(page, () => {
                const g = window.demianGameApplication?.activeGame;
                return g?.model?.status === 'ready' && g.ui?.dialog?.open;
            }, 35000);
            const restarted = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return {
                    difficulty: g.model.difficulty, elapsed: g.model.elapsed,
                    orders: g.model.orders.length, score: g.model.score,
                    tray: g.model.tray, challenge: g.gameplayChallenge.state,
                };
            });
            assert.deepEqual(restarted, {
                difficulty: 'hard', elapsed: 0, orders: 0, score: 0, tray: null, challenge: 'idle',
            });
            await page.locator('[data-rush-action="confirm"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'running');
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                g.model.elapsed = 120 - .005;
                g.fixedUpdate(1 / 60, { interact: true });
            });
            await wait(page, () => window.demianGameApplication.sessionState === 'results');
            assert.deepEqual(await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { score: g.model.result().score, delivered: g.model.delivered,
                    status: g.model.status };
            }), { score: 0, delivered: 0, status: 'finished' });
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await wait(page, () => window.demianGameApplication.sessionState === 'menu', 18000);
            await wait(page, () => !document.querySelector('.rush-dialog'));
            assert.deepEqual(pageErrors, [], 'No unhandled page errors');
            report.environments.push({
                label, viewport: [width, height], emulatedTouch: mobile, status: 'passed',
                keyboardMoved: distance, pauseFrozen: true,
                simultaneousOrders: concurrency.activeOrders,
                standardService: acceptance, vipService, localResult: result,
                restartReset: true, expiryTerminal: true, runtimeErrors: 0,
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
    writeFileSync(resolve(output, 'cafe-rush-browser.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 26] Café Rush browser QA failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 26] Café Rush browser acceptance passed:', report.environments.map(x => ({
        label: x.label, result: x.localResult, simultaneousOrders: x.simultaneousOrders,
    })));
}