import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const project = resolve(import.meta.dirname, '..'), release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(project, '_site'));
const out = resolve(project, 'docs/release-v16-controls');
const settingsOnly = process.argv.includes('--settings-only');
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), file = resolve(release, `.${path.endsWith('/') ? path + 'index.html' : path}`);
        if (!file.startsWith(release + '/')) throw Error('Outside release');
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = { status: 'running', physicalHardwareMeasured: false, gamepad: 'emulated standard mapping', renderer: 'headless Chromium software rendering', profiles: [] };
try {
    browser = await chromium.launch({ headless: true, ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    report.browser = browser.version();
    for (const profile of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 2, isMobile: profile.name === 'mobile', hasTouch: profile.name === 'mobile' });
        await context.addInitScript(() => {
            window.testPadButtons = []; window.testPadAxes = [0, 0]; window.testPadConnected = false;
            Object.defineProperty(navigator, 'getGamepads', { value: () => window.testPadConnected ? [{ index: 0, connected: true, mapping: 'standard', axes: window.testPadAxes,
                buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: window.testPadButtons.includes(i), value: Number(window.testPadButtons.includes(i)) })) }] : [] });
        });
        const page = await context.newPage(), errors = [], failures = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failures.push(new URL(response.url()).pathname); });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        console.log(`${profile.name}: menu ready`);
        await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'playing');
        if (settingsOnly) {
            await page.evaluate(async () => { const app = window.demianGameApplication; app.pauseGame(); await app.shell.showSettings(); app.shell.toast('ورود به پیشخوان و محصولات', 'info'); });
            assert.equal(await page.locator('.shell-toast--info').last().isVisible(), false);
            await page.locator('[data-control-bindings] summary').click();
            await page.locator('[data-bind-action="dash"]').focus();
            await page.screenshot({ path: resolve(out, `controls-${profile.name}.png`) });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            report.profiles.push({ ...profile, pausedInfoToastHidden: 'passed', settingsScrollAndBindings: 'passed', errors, failures });
            assert.deepEqual(errors, []); assert.deepEqual(failures, []);
            await context.close(); continue;
        }
        await page.keyboard.press('ArrowRight');
        const ready = () => page.waitForFunction(() => { const e = window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock <= 0 && e.actionCooldown <= 0; });
        await ready();
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'ی', bubbles: true, cancelable: true })));
        await page.waitForFunction(() => window.demianGameApplication.input.held.has('d'));
        await page.waitForTimeout(180);
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'ی', bubbles: true })));
        await page.keyboard.down('ArrowDown'); await page.waitForTimeout(160);
        assert.notEqual(await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.state), 'slide'); await page.keyboard.up('ArrowDown');
        const actions = [];
        for (const [key, state] of [['x', 'dash'], ['c', 'dodge'], ['g', 'slide'], ['v', 'wave'], ['o', 'celebrate']]) {
            await ready(); await page.keyboard.press(key); await page.waitForFunction(state => window.demianGameApplication.characterManager.activeEntity.state === state, state);
            const result = await page.evaluate(() => { const e = window.demianGameApplication.characterManager.activeEntity;
                return { state: e.state, duration: e.stateLock, particles: e.feedback.items.length, clip: e.animator.animationName, declaredClip: e.atlas.animations[e.state] ? e.state : e.atlas.fallbacks[e.state], frames: e.animator.currentFrames().length }; });
            assert.equal(result.clip, result.declaredClip); assert.ok(result.frames > 1); assert.ok(result.particles > 0); actions.push(result);
            if (state === 'dash') await page.screenshot({ path: resolve(out, `dash-${profile.name}.png`) });
            console.log(`${profile.name}: ${state} (${result.clip})`);
        }
        await ready(); await page.keyboard.press('Space');
        await page.waitForFunction(() => { const e = window.demianGameApplication.characterManager.activeEntity; return !e.grounded && e.jumpVelocity < 0 && e.bodyRoot.position.y < .35; });
        await page.keyboard.press('x'); await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'dash'); await ready();
        console.log(`${profile.name}: landing buffer passed`);
        await page.evaluate(() => { window.testPadConnected = true; }); await page.waitForFunction(() => !window.demianGameApplication.input.gamepad.gated && window.demianGameApplication.input.gamepad.buttons.size === 0);
        await page.evaluate(() => { window.testPadButtons = [2]; }); await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'dash');
        await page.evaluate(() => { window.testPadButtons = []; }); await page.waitForFunction(() => !window.demianGameApplication.input.gamepad.gated && window.demianGameApplication.input.gamepad.buttons.size === 0);
        await page.evaluate(() => { window.testPadButtons = [9]; }); await page.waitForFunction(() => window.demianGameApplication.sessionState === 'paused');
        await page.evaluate(() => { window.testPadButtons = []; }); await page.waitForFunction(() => !window.demianGameApplication.input.gamepad.gated && window.demianGameApplication.input.gamepad.buttons.size === 0);
        await page.evaluate(() => { window.testPadButtons = [9]; }); await page.waitForFunction(() => window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => { window.testPadButtons = []; }); await page.waitForFunction(() => !window.demianGameApplication.input.gamepad.gated && window.demianGameApplication.input.gamepad.buttons.size === 0);
        console.log(`${profile.name}: gamepad pause/resume passed`);
        await page.evaluate(() => window.demianGameApplication.pauseGame()); await page.evaluate(() => window.demianGameApplication.shell.showSettings());
        await page.locator('[data-control-bindings] summary').click(); await page.locator('[data-bind-action="dash"]').click(); await page.keyboard.press('v');
        await page.waitForFunction(() => document.querySelector('[data-binding-status]').textContent.includes('استفاده')); await page.keyboard.press('j');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('demian.controls.v1')).dash), 'j');
        await page.screenshot({ path: resolve(out, `controls-${profile.name}.png`) });
        await page.locator('[data-bind-reset]').click(); assert.equal(await page.evaluate(() => window.demianGameApplication.input.bindings.bindings.dash), 'x');
        await page.locator('[data-screen="settings"] [data-shell-action="close-modal"]').click(); await page.evaluate(() => window.demianGameApplication.resumeGame());
        if (profile.name === 'mobile') {
            await ready(); await page.locator('[data-mobile-actions-toggle]').click(); const button = page.locator('[data-input-press="dodge"]');
            await button.waitFor({ state: 'visible' }); await button.tap(); await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'dodge');
        }
        const rosterActions = [];
        if (profile.name === 'desktop') {
            const records = await page.evaluate(() => window.demianGameApplication.characterManager.characters.map(e => ({ id: e.id, slug: e.slug })));
            for (const record of records) {
                await page.evaluate(id => window.demianGameApplication.characterManager.select(id), record.id);
                await page.keyboard.press('ArrowRight'); await ready();
                for (const [key, state] of [['x', 'dash'], ['c', 'dodge'], ['g', 'slide']]) {
                    await ready(); await page.keyboard.press(key); await page.waitForFunction(state => window.demianGameApplication.characterManager.activeEntity.state === state, state);
                }
                rosterActions.push({ slug: record.slug, dash: 'passed', dodge: 'passed', slide: 'passed' }); console.log(`roster: ${record.slug}`);
            }
        }
        await page.evaluate(() => window.demianGameApplication.launchGame('dino-run'));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.model?.status === 'ready');
        await page.locator('.runner-ready button').click();
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'running');
        await page.evaluate(() => { const m = window.demianGameApplication.activeGame.model; m.spawnIn = 999; m.obstacles = []; window.testPadButtons = []; });
        await page.waitForFunction(() => !window.demianGameApplication.input.gamepad.gated && window.demianGameApplication.input.gamepad.buttons.size === 0);
        await page.evaluate(() => { window.testPadButtons = [0]; });
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
        await page.evaluate(() => { window.testPadButtons = []; });
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
        await page.evaluate(() => { window.testPadButtons = [1]; });
        await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.state === 'slide');
        await page.evaluate(() => { window.testPadButtons = []; });
        await page.evaluate(() => window.demianGameApplication.settings.update({ motion: 'reduced' }));
        assert.equal(await page.evaluate(() => window.demianGameApplication.settings.resolvedReducedMotion()), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        const runtimeErrors = await page.evaluate(() => [...window.demianGameApplication.runtime.errorCounts.entries()]);
        assert.deepEqual(runtimeErrors, []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        report.profiles.push({ ...profile, actions, rosterActions, persianKeyboard: 'passed', arrowDownMovement: 'passed', landingBuffer: 'passed', gamepadDashPauseResume: 'passed',
            runnerGamepadJumpDuck: 'passed', rebindConflictPersistenceReset: 'passed', touchDodge: profile.name === 'mobile' ? 'passed' : 'not applicable', reducedMotionSetting: 'passed', errors, failures, runtimeErrors });
        console.log(`${profile.name}: passed`); await context.close();
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = error.stack;
    for (const context of browser?.contexts() ?? []) for (const page of context.pages()) console.error(await page.evaluate(() => ({ focus: document.hasFocus(), session: window.demianGameApplication?.sessionState, context: window.demianGameApplication?.input.contextName, gamepad: { gated: window.demianGameApplication?.input.gamepad.gated, buttons: [...(window.demianGameApplication?.input.gamepad.buttons ?? [])] } })).catch(() => null));
    for (const context of browser?.contexts() ?? []) for (const page of context.pages()) await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await writeFile(resolve(out, settingsOnly ? 'settings-layout-checks.json' : 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n'); await browser?.close(); await new Promise(done => server.close(done));
}
