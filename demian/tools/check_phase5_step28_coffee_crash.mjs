import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase5-step28');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build static release before Step 28 browser QA');
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
const wait = (page, check, timeout = 16000) => page.waitForFunction(check, null, { timeout });
const report = {
    schema: 1, status: 'pending', views: [], errors: [],
    emulatedDevices: true, physicalDeviceVerified: false, liveRankedSubmissionVerified: false,
    limitations: [
        'No physical Android/iOS instrumentation; Chromium device emulation only.',
        'Browser QA runs in practice mode, never submits a score to the server.',
        'Real PHP/JS seeded swap parity and denial of forged proof are checked independently by PHPUnit.',
        'Fifty simultaneous users, real HTTPS account runs, 30-minute thermal soak, security and backup acceptance remain release blockers.',
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
            await page.clock.setFixedTime(new Date('2026-11-21T08:00:00Z'));
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.setFixedTime(new Date('2026-11-21T08:00:00Z'));
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 30000);
            await page.getByRole('button', { name: 'انتخاب بازی', exact: true }).click();
            await page.getByText('خوراکی‌ها را جابه‌جا کن، ترکیب ویژه بساز و سفارش‌های سه مرحلهٔ هر هفته را آماده کن.', { exact: true }).waitFor();
            await page.getByRole('button', { name: /اجرای COFFEE CRASH/ }).click();
            await wait(page, () => {
                const g = window.demianGameApplication?.activeGame;
                return g?.ui?.view === 'entry' && g.ui.dialog.open;
            }, 35000);
            const entry = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return {
                    level: g.model.level.id, moves: g.model.moves,
                    count: g.ui.cells.length, choices: g.ui.dialog.querySelectorAll('[data-coffee-level-choice]').length,
                    locked: g.ui.dialog.querySelector('[data-coffee-level-choice="2"]').disabled,
                    overflow: document.documentElement.scrollWidth > innerWidth + 2,
                };
            });
            assert.deepEqual(entry, {
                level: 1, moves: 25, count: 56, choices: 3, locked: false, overflow: false,
            });
            const blockedEntry = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                g.dialogAction('not-a-button');
                return { view: g.ui.view, open: g.ui.dialog.open };
            });
            assert.deepEqual(blockedEntry, { view: 'entry', open: true });

            await page.locator('[data-coffee-dialog-action="start"]').click();
            await wait(page, () => {
                const g = window.demianGameApplication.activeGame;
                return !g.startingRanked && !g.ui.dialog.open && !g.ui.blocked;
            });
            const opened = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { ranked: g.rankRun?.mode, opening: g.model.findMove(),
                    status: g.model.status, cols: 7, rows: 8 };
            });
            assert.equal(opened.ranked, 'practice');
            assert.equal(opened.status, 'playing');
            assert.equal(opened.opening.length, 2);

            await page.evaluate(() => window.demianGameApplication.pauseGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'paused');
            const pauseSnapshot = await page.evaluate(() =>
                window.demianGameApplication.activeGame.model.snapshot());
            await page.waitForTimeout(150);
            assert.deepEqual(await page.evaluate(() =>
                window.demianGameApplication.activeGame.model.snapshot()), pauseSnapshot);
            await page.evaluate(() => window.demianGameApplication.resumeGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'playing');

            await page.locator('[data-coffee-action="hint"]').click();
            assert.equal(await page.locator('[data-hint="true"]').count(), 2);
            const before = await page.evaluate(() =>
                window.demianGameApplication.activeGame.model.snapshot());
            const first = await page.evaluate(() =>
                window.demianGameApplication.activeGame.model.findMove());
            for (const idx of first) await page.locator('[data-coffee-cell="' + idx + '"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.ui.blocked);
            await wait(page, () => !window.demianGameApplication.activeGame.ui.blocked, 30000);
            const moved = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { moves: g.model.moves, score: g.model.score, chain: g.model.bestChain,
                    matches: g.model.findMove() };
            });
            assert.equal(moved.moves, before.moves - 1);
            assert.ok(moved.score >= 180);
            assert.ok(moved.chain >= 1);
            assert.ok(moved.matches);
            await page.locator('[data-coffee-action="undo"]').click();
            const undo = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { snapshot: g.model.snapshot(), used: g.model.usedUndo,
                    buttonDisabled: g.ui.undoButton.disabled };
            });
            assert.deepEqual(undo.snapshot, before);
            assert.equal(undo.used, true);
            assert.equal(undo.buttonDisabled, true);

            await page.evaluate(() => window.demianGameApplication.activeGame.startSession());
            await wait(page, () => window.demianGameApplication.activeGame.ui.dialog.open);
            assert.equal(await page.locator('[data-coffee-level-choice="3"]').isEnabled(), true);
            await page.locator('[data-coffee-level-choice="3"]').click();
            await page.locator('[data-coffee-dialog-action="start"]').click();
            await wait(page, () => {
                const g = window.demianGameApplication.activeGame;
                return g.model.level.id === 3 && !g.startingRanked && !g.ui.dialog.open;
            });
            const finale = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const m = g.model;
                if (g.rankRun.mode !== 'practice') throw Error('Never fabricate ranked evidence');
                return { level: m.level.id, moves: m.moves, goals: m.level.goals.length,
                    initialMove: m.findMove(), score: m.score };
            });
            assert.equal(finale.level, 3);
            assert.equal(finale.moves, 29);
            assert.equal(finale.goals, 2);
            assert.equal(finale.score, 0);
            // One move left, a legal swap, and a genuine terminal loss path.
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                if (g.rankRun.mode !== 'practice') throw Error('Practice-only terminal probe');
                g.model.moves = 1;
            });
            for (const idx of finale.initialMove) await page.locator('[data-coffee-cell="' + idx + '"]').click();
            await wait(page, () => window.demianGameApplication.sessionState === 'results', 35000);
            const lost = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { state: g.model.status, score: g.model.score, moves: g.model.moves,
                    ranking: g.rankRun.mode, stars: g.model.stars };
            });
            assert.equal(lost.state, 'lost');
            assert.ok(lost.score >= 180);
            assert.equal(lost.moves, 0);
            assert.equal(lost.ranking, 'practice');
            assert.equal(lost.stars, 0);
            const resultText = await page.locator('[data-results-score]').innerText();
            assert.doesNotMatch(resultText, /NaN|ناعدد/i);
            assert.match(resultText, /مرحلهٔ ۳/);
            if (label === 'phone-390-portrait') await page.screenshot({
                path: resolve(output, 'coffee-crash-390-results.png'), animations: 'disabled' });

            await page.locator('[data-screen="results"] [data-shell-action="leaderboard"]').click();
            const ranking = page.locator('[data-screen="leaderboard"]');
            await wait(page, () => document.querySelector('[data-ranking-game]').value === 'coffee-crash');
            await wait(page, () => /مرحلهٔ ۳/.test(document.querySelector('[data-ranking-rows]').textContent));
            assert.equal(await ranking.locator('[data-ranking-game] option:not(:disabled)').count(), 6);
            assert.doesNotMatch(await ranking.locator('[data-ranking-rows]').innerText(), /NaN|ناعدد/i);
            await ranking.locator('[data-shell-action="close-modal"]').click();

            await page.locator('[data-screen="results"] [data-shell-action="restart"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.ui?.view === 'entry');
            const reset = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { level: g.model.level.id, moves: g.model.moves, score: g.model.score,
                    actions: g.rankActions.length, busy: g.startingRanked,
                    history: g.model.history, unlocked: g.store.unlocked,
                    level3Locked: g.ui.dialog.querySelector('[data-coffee-level-choice="3"]').disabled };
            });
            assert.deepEqual(reset, {
                level: 1, moves: 25, score: 0, actions: 0, busy: false, history: null,
                unlocked: 1, level3Locked: false,
            });
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await wait(page, () => window.demianGameApplication.sessionState === 'menu', 15000);
            await wait(page, () => !document.querySelector('.coffee-dialog'));
            assert.deepEqual(errors, [], 'Uncaught runtime errors');
            report.views.push({ label, viewport: [width, height], emulatedTouch: mobile,
                status: 'passed', firstMoveScore: moved.score, undoRestored: true,
                level3Loss: lost, restartClean: true, errors: errors.length });
        } finally { await context.close(); }
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'coffee-crash-browser.json'),
        JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 28] Coffee Crash browser acceptance failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 28] Coffee Crash browser acceptance passed:', report.views);
}
