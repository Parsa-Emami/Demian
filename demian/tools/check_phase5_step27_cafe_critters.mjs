import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase5-step27');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Build static release before Step 27 browser QA');
mkdirSync(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('Invalid path');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
});
const wait = (page, condition, timeout = 15000) => page.waitForFunction(condition, null, { timeout });
const report = { schema: 1, status: 'pending', environments: [], errors: [],
    emulatedDevices: true, physicalDeviceVerified: false, liveRankedSubmissionVerified: false,
    limitations: [
        'Emulated touch is not proof of actual Android/iOS responsiveness.',
        'Browser scenarios are practice-only and never publish score evidence.',
        'The independently seeded PHP replay and API are verified in SQLite/MySQL CI.',
        'Real HTTPS API, 50-concurrent load and red-team testing remain production gates.',
    ] };
let browser;

try {
    await new Promise(ready => server.listen(0, '127.0.0.1', ready));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    for (const { label, width, height, mobile } of [
        { label: 'phone-320-portrait', width: 320, height: 568, mobile: true },
        { label: 'phone-390-portrait', width: 390, height: 844, mobile: true },
        { label: 'phone-844-landscape', width: 844, height: 390, mobile: true },
        { label: 'desktop-1440', width: 1440, height: 900, mobile: false },
    ]) {
        const context = await browser.newContext({
            viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
            isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
        try {
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await wait(page, () => window.demianGameApplication?.sessionState === 'menu', 30000);
            await page.evaluate(() => window.demianGameApplication.launchGame('cafe-critters'));
            await wait(page, () => {
                const g = window.demianGameApplication?.activeGame;
                return g?.model?.status === 'ready' && g.ui?.view === 'entry' && g.ui?.dialog.open;
            }, 35000);
            const entry = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { goal: g.model.targets.length, found: g.model.found,
                    remaining: g.model.remaining,
                    choices: g.ui.dialogChoices.map(b => ({
                        id: b.dataset.crittersChoice, height: b.getBoundingClientRect().height })),
                    overflow: document.documentElement.scrollWidth > innerWidth + 2 };
            });
            assert.equal(entry.goal, 3);
            assert.equal(entry.found, 0);
            assert.equal(entry.remaining, 240);
            assert.equal(entry.overflow, false);
            assert.deepEqual(entry.choices.map(x => x.id), ['calm', 'easy', 'standard', 'hard']);
            assert.ok(entry.choices.every(x => x.height >= 44));
            assert.deepEqual(await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                g.handleDialog('invalid-action');
                return [g.ui.view, g.ui.dialog.open, g.model.status];
            }), ['entry', true, 'ready'], 'Unexpected modal input must not start a round');
            await page.locator('[data-critters-choice="hard"]').click();
            await page.locator('[data-critters-dialog-action="confirm"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'playing');
            const started = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { mode: g.rankRun?.mode, difficulty: g.model.difficulty,
                    controls: g.ui.controls.length, time: g.model.remaining };
            });
            assert.equal(started.mode, 'practice');
            assert.equal(started.difficulty, 'hard');
            assert.equal(started.controls, 8);
            assert.ok(started.time <= 180 && started.time > 178);

            await page.evaluate(() => window.demianGameApplication.pauseGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'paused');
            const frozen = await page.evaluate(() => window.demianGameApplication.activeGame.model.elapsed);
            await page.waitForTimeout(120);
            assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.elapsed), frozen);
            await page.evaluate(() => window.demianGameApplication.resumeGame());
            await wait(page, () => window.demianGameApplication.sessionState === 'playing');

            const pick = async (field, value) => {
                const button = page.locator('[data-critters-category="' + field
                    + '"][data-critters-option="' + value + '"]');
                await button.click();
                assert.equal(await button.getAttribute('aria-pressed'), 'true');
            };
            const invite = async () => page.locator('[data-critters-action="invite"]').click();
            const next = async () => page.locator('[data-critters-action="next"]').click();
            const solved = [];
            for (let index = 0; index < 3; index++) {
                const current = await page.evaluate(() => {
                    const m = window.demianGameApplication.activeGame.model;
                    return { id: m.guest.id, setting: { ...m.guest.setting }, page: m.page };
                });
                assert.equal(current.page, index);
                solved.push(current.id);
                if (index === 0) {
                    const wrong = {
                        light: current.setting.light === 'sun' ? 'moon' : 'sun',
                        food: current.setting.food === 'berries' ? 'seeds' : 'berries',
                        decor: current.setting.decor === 'book' ? 'vase' : 'book',
                    };
                    for (const [field, value] of Object.entries(wrong)) await pick(field, value);
                    await invite();
                    assert.deepEqual(await page.evaluate(() => {
                        const m = window.demianGameApplication.activeGame.model;
                        return [m.misses, m.feedback.matches, m.hint];
                    }), [1, 0, null]);
                    await invite();
                    assert.equal(await page.evaluate(() =>
                        window.demianGameApplication.activeGame.model.misses), 1);
                    await pick('light', current.setting.light);
                    await invite();
                    const hint = await page.evaluate(() => {
                        const g = window.demianGameApplication.activeGame;
                        return { missed: g.model.misses, exact: { ...g.model.hint },
                            visible: !g.ui.nodes.hint.hidden };
                    });
                    assert.equal(hint.missed, 2);
                    assert.equal(hint.visible, true);
                    const differentFood = ['cardamom', 'berries', 'seeds'].find(
                        f => f !== wrong.food && f !== current.setting.food);
                    await pick('food', differentFood);
                    await invite();
                    assert.deepEqual(await page.evaluate(() => ({
                        ...window.demianGameApplication.activeGame.model.hint,
                    })), hint.exact, 'The single exact hint must not change after additional guesses');
                }
                for (const [field, value] of Object.entries(current.setting)) await pick(field, value);
                await invite();
                const visit = await page.evaluate(() => {
                    const g = window.demianGameApplication.activeGame;
                    return { status: g.model.status, found: g.model.found, album: g.model.album.size,
                        reward: !g.ui.nodes.reward.hidden,
                        disabled: g.ui.controls.every(b => b.disabled),
                        drawing: g.ui.nodes['table-guest'].querySelectorAll('[data-critters-visitor]').length };
                });
                assert.deepEqual(visit, {
                    status: 'visiting', found: index + 1, album: index + 1,
                    reward: true, disabled: true, drawing: 1,
                });
                if (index === 0) {
                    await page.locator('[data-critters-action="album"]').click();
                    await wait(page, () => window.demianGameApplication.activeGame.ui.view === 'album');
                    assert.equal(await page.locator('[data-critter-unlocked="true"]').count(), 1);
                    assert.equal(await page.locator('[data-critter-unlocked="false"]').count(), 7);
                    await page.locator('[data-critters-dialog-action="confirm"]').click();
                    await wait(page, () => !window.demianGameApplication.activeGame.ui.dialog.open);
                }
                await next();
            }
            await wait(page, () => window.demianGameApplication.sessionState === 'results', 15000);
            const result = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const r = g.model.result();
                return { ...r, mode: g.rankRun?.mode,
                    persisted: [...g.model.album].every(id =>
                        localStorage.getItem('demian.cafe-critters.v1.guest.' + id) === '1') };
            });
            assert.equal(result.won, true);
            assert.equal(result.found, 3);
            assert.equal(result.newPages, 3);
            assert.equal(result.discovered, 3);
            assert.equal(result.misses, 3);
            assert.equal(result.mode, 'practice');
            assert.equal(result.persisted, true);
            if (label === 'phone-390-portrait') await page.screenshot({
                path: resolve(output, 'cafe-critters-390-results.png'), animations: 'disabled' });

            await page.locator('[data-screen="results"] [data-shell-action="restart"]').click();
            await wait(page, () => {
                const g = window.demianGameApplication?.activeGame;
                return g?.model.status === 'ready' && g.ui.dialog.open;
            }, 35000);
            const restarted = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { grade: g.model.difficulty, album: g.model.album.size, found: g.model.found,
                    target: g.model.guest.id, rankActions: g.rankActions.length };
            });
            assert.equal(restarted.grade, 'hard');
            assert.equal(restarted.album, 3);
            assert.equal(restarted.found, 0);
            assert.ok(!solved.includes(restarted.target));
            assert.equal(restarted.rankActions, 0);
            await page.locator('[data-critters-dialog-action="confirm"]').click();
            await wait(page, () => window.demianGameApplication.activeGame.model.status === 'playing');
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                g.model.elapsed = g.model.rules.seconds - 0.005;
                g.fixedUpdate(1 / 60);
            });
            await wait(page, () => window.demianGameApplication.sessionState === 'results');
            assert.deepEqual(await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                return { won: g.model.result().won, found: g.model.found,
                    status: g.model.status, time: g.model.remaining };
            }), { won: false, found: 0, status: 'finished', time: 0 });
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await wait(page, () => window.demianGameApplication.sessionState === 'menu', 15000);
            await wait(page, () => !document.querySelector('.critters-dialog'));
            assert.deepEqual(errors, [], 'Unhandled page errors');
            report.environments.push({ label, viewport: [width, height],
                mobileEmulated: mobile, status: 'passed', solved,
                hint: 'stable', persistentAlbum: true, pauseFrozen: true,
                restartReset: true, expiredWithoutScore: true, pageErrors: 0 });
        } finally { await context.close(); }
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'cafe-critters-browser.json'),
        JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 27] Café Critters browser acceptance failed:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[Step 27] Café Critters browser acceptance passed:', report.environments);
}
