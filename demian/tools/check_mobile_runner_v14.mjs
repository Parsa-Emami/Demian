/** Optional end-to-end QA. Requires Playwright + Chromium; does not ship them at runtime.
 * DEMIAN_PLAYWRIGHT_MODULE and DEMIAN_BROWSER_EXECUTABLE can point to existing installations.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, 'demian/docs/release-v14-negar');
const screenshotDir = resolve(process.env.DEMIAN_QA_SCREENSHOT_DIR ?? resolve(tmpdir(), 'demian-negar-v14-runner'));
const playable = resolve(root, 'playable');
const modulePath = process.env.DEMIAN_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
await mkdir(out, { recursive: true });
await mkdir(screenshotDir, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(playable, `.${pathname}`);
        if (!file.startsWith(`${playable}/`)) throw new Error('Outside export');
        const data = await readFile(file);
        response.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream'); response.end(data);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, ...(process.env.DEMIAN_BROWSER_EXECUTABLE
    ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-gpu'] });
const results = { browser: browser.version(), mode: 'headless software Chromium; device dimensions emulated',
    viewports: [], functional: [], errors: [], physicalPhoneMeasured: false };
try {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1440, 900]]) {
        const mobile = width < 1024;
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
            isMobile: mobile, hasTouch: mobile });
        const page = await context.newPage();
        const pageErrors = [], failedRequests = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('response', (response) => { if (response.status() >= 400) failedRequests.push({url: new URL(response.url()).pathname,status:response.status()}); });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        await page.evaluate(() => document.fonts.ready);
        const roster = await page.evaluate(() => window.demianGameApplication.characterManager.characters.map((c) => c.slug));
        assert.deepEqual(roster.sort(), ['darya', 'negar', 'setayesh', 'uzudi']);
        await page.locator('.menu-character-button').click();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-character-preview]')].length === 4
            && [...document.querySelectorAll('[data-character-preview]')].every((e) => e.dataset.previewState === 'ready'));
        if (width === 390) await page.screenshot({ path: resolve(screenshotDir, 'characters-390.png') });
        await page.locator('.character-sheet-close').click();
        await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'collapsed');
        await page.evaluate(() => window.demianGameApplication.launchGame('dino-run', { seed: 127 }));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.model?.status === 'ready');
        const geometry = await page.evaluate(() => {
            const app = window.demianGameApplication, canvas = document.querySelector('[data-game-canvas]');
            const controls = [...document.querySelectorAll('[data-control-surface="dino-run"] button')].map((e) => {
                const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, visible: !!e.getClientRects().length };
            });
            return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
                backbuffer: [app.rendererService.logicalWidth, app.rendererService.logicalHeight],
                presentationMode: app.rendererService.presentationMode,
                canvasCss: [canvas.clientWidth, canvas.clientHeight], controls };
        });
        assert.equal(geometry.overflow, false); assert.equal(geometry.presentationMode, 'smooth');
        assert.ok(geometry.backbuffer[0] * geometry.backbuffer[1] <= 1250000);
        for (const c of geometry.controls) assert.ok(c.visible && c.w >= 44 && c.h >= 44 && c.x >= 0 && c.y >= 0
            && c.x + c.w <= width + 1 && c.y + c.h <= height + 1);
        if (width === 390) {
            await page.locator('.runner-ready button').click();
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'running');
            await page.evaluate(() => { const m = window.demianGameApplication.activeGame.model; m.spawnIn = 999; m.obstacles = []; });
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
            const touch = await context.newCDPSession(page);
            for (const slug of ['darya', 'setayesh', 'uzudi', 'negar']) {
                await page.locator('.play-toolbar [data-sidebar-toggle]').click();
                await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'expanded');
                await page.locator(`[data-select-character="${slug}"]`).click();
                await page.waitForFunction((expected) => window.demianGameApplication.activeGame.avatar.slug === expected, slug);
                await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'collapsed');
                await page.waitForTimeout(420);
                const rect = await page.locator('.runner-controls__duck').boundingBox();
                await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
                await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.state === 'slide');
                // Place a real model bird at the player while the real touch input remains held.
                await page.evaluate(() => {
                    const m = window.demianGameApplication.activeGame.model;
                    m.obstacles = [{id:1,type:'bird',x:104,previousX:104,y:46,w:40,h:22,scored:false}];
                });
                await page.waitForTimeout(160);
                const slide = await page.evaluate(() => {
                    const g = window.demianGameApplication.activeGame;
                    return { status: g.model.status, state: g.avatar.state, frame: g.avatar.animator.currentFrameName(), version: g.avatar.atlas.meta.version };
                });
                assert.equal(slide.status, 'running'); assert.equal(slide.state, 'slide'); assert.equal(slide.version, 14);
                assert.match(slide.frame, /^slide_e_/);
                await page.evaluate(() => { const a = window.demianGameApplication; a.runtime.pause(); const m = a.activeGame.model;
                    m.time=10; m.y=0; m.previous.y=0; m.obstacles=[{id:1,type:'bird',x:80,previousX:80,y:46,w:40,h:22,scored:false}];
                    a.activeGame.updateHud(); a.activeGame.render(1); });
                await page.screenshot({ path: resolve(screenshotDir, `${slug}-slide-390.png`) });
                await page.evaluate(() => { const a = window.demianGameApplication; a.activeGame.model.obstacles=[]; a.runtime.resume(); });
                await touch.send('Input.dispatchTouchEvent', { type:'touchEnd',touchPoints:[] });
                await page.waitForFunction(() => !window.demianGameApplication.activeGame.model.duck);
                await page.keyboard.down('Space');
                await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
                assert.ok(['takeoff','jump','fall'].includes(await page.evaluate(()=>window.demianGameApplication.activeGame.avatar.state)));
                await page.keyboard.up('Space');
                await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
                results.functional.push({ character:slug, selectedViaUi:true, nativeTouchSlide:'passed', birdCleared:'passed', keyboardJump:'passed' });
            }
            await page.evaluate(() => { const a=window.demianGameApplication;a.runtime.pause();const g=a.activeGame;g.model.time=48;g.model.obstacles=[];g.render(1); });
            await page.screenshot({ path: resolve(screenshotDir, 'night-390.png') });
            await page.evaluate(() => { const a=window.demianGameApplication; const g=a.activeGame;g.model.time=32;g.render(1); });
            await page.screenshot({ path: resolve(screenshotDir, 'sunset-390.png') });
            await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
            await page.waitForFunction(() => window.demianGameApplication.activeGameId==='open-world' && window.demianGameApplication.sessionState==='playing');
            const world = await page.evaluate(() => ({ slug: window.demianGameApplication.characterManager.activeRecord.slug,
                slugs: window.demianGameApplication.characterManager.characters.map(c=>c.slug),
                actions: [...document.querySelectorAll('[data-mobile-actions-tray] [data-input-press]')].map(b=>b.dataset.inputPress) }));
            assert.equal(world.slug, 'negar'); assert.deepEqual(world.slugs.sort(), ['darya','negar','setayesh','uzudi']);
            assert.deepEqual(world.actions, ['slide','celebrate','ability','speak','quickSave']);
            await page.waitForTimeout(400); await page.screenshot({path:resolve(screenshotDir,'world-390.png')});
            results.functional.push({sharedSelectionAcrossGames:'passed',relevantActionPicker:'passed'});
            await page.waitForFunction(() => {
                const e=window.demianGameApplication.characterManager.activeEntity;
                return e.grounded && e.stateLock<=0;
            });
            await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({close:true}));
            await page.keyboard.press('q');
            await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state==='smile_bloom');
            const before = await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.abilityController.remaining());
            await page.keyboard.press('q');
            const after = await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.abilityController.remaining());
            assert.ok(after <= before, 'Repeated Q must not restart the cooldown');
            await page.waitForTimeout(350);
            await page.screenshot({path:resolve(screenshotDir,'negar-smile-bloom-390.png')});
            await page.waitForFunction(() => !document.querySelector('[data-character-ability]').disabled, null, {timeout:12000});
            await page.locator('[data-mobile-actions-toggle]').tap();
            const abilityRect = await page.locator('[data-character-ability]').boundingBox();
            assert.ok(abilityRect && abilityRect.x>=0 && abilityRect.y>=0 && abilityRect.x+abilityRect.width<=width+1 && abilityRect.y+abilityRect.height<=height+1);
            await page.locator('[data-character-ability]').tap();
            await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state==='smile_bloom');
            assert.equal(await page.locator('[data-character-ability]').isDisabled(), true);
            await page.waitForTimeout(250);
            await page.screenshot({path:resolve(screenshotDir,'negar-ability-touch-390.png')});
            await page.locator('.play-toolbar [data-sidebar-toggle]').click();
            await page.locator('[data-select-character="builtin-darya"]').click();
            await page.waitForFunction(() => window.demianGameApplication.characterManager.activeRecord.slug==='darya');
            await page.waitForFunction(() => document.querySelector('[data-character-ability]').hidden);
            assert.equal(await page.locator('[data-character-ability]').isVisible(), false);
            await page.keyboard.press('q');
            assert.equal(await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.abilityController.primary), null);
            results.functional.push({character:'negar',keyboardAbility:'passed',nativeTouchAbility:'passed',cooldownPreventsStacking:'passed',otherCharactersKeepControls:'passed'});

        } else await page.screenshot({path:resolve(screenshotDir,`runner-${width}x${height}.png`)});
        assert.deepEqual(pageErrors, []); assert.deepEqual(failedRequests, []);
        results.viewports.push({width,height,...geometry,roster, runtimeErrors:pageErrors, failedRequests});
        await context.close(); console.log(`Browser QA passed: ${width}x${height}`);
    }
    results.status='passed';
} catch (error) {
    results.status='failed';results.errors.push(error.stack);
    for (const context of browser.contexts()) for (const page of context.pages()) {
        await page.screenshot({path:resolve(screenshotDir,'failure.png')}).catch(()=>{});
        results.failureState=await page.evaluate(()=>({session:window.demianGameApplication?.sessionState,
            runtimePaused:window.demianGameApplication?.runtime.paused,
            inputContext:window.demianGameApplication?.input.contextName,
            held:[...window.demianGameApplication?.input.virtualHeld??[]],
            state:window.demianGameApplication?.activeGame?.avatar?.state,
            status:window.demianGameApplication?.activeGame?.model?.status,
            sidebar:document.querySelector('[data-character-manager]')?.dataset.sidebarState})).catch(()=>null);
    }
    throw error;
}
finally {
    await writeFile(resolve(out,'browser-checks.json'),JSON.stringify(results,null,2)+'\n');
    await browser.close();await new Promise(done=>server.close(done));
}
