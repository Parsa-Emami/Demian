/** Optional end-to-end QA. Requires Playwright + Chromium; does not ship them at runtime.
 * DEMIAN_PLAYWRIGHT_MODULE and DEMIAN_BROWSER_EXECUTABLE can point to existing installations.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { BUILTIN_CHARACTER_SLUGS } from '../resources/js/game/characters/CharacterVisualContract.js';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(root, 'demian/docs/release-v14-negar'));
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
    ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: process.env.DEMIAN_BROWSER_ARGS ? JSON.parse(process.env.DEMIAN_BROWSER_ARGS) : ['--no-sandbox', '--disable-gpu'] });
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
        assert.deepEqual(roster.sort(), [...BUILTIN_CHARACTER_SLUGS].sort());
        await page.locator('.menu-character-button').click();
        await page.waitForFunction((count) => [...document.querySelectorAll('[data-character-preview]')].length === count
            && [...document.querySelectorAll('[data-character-preview]')].every((e) => e.dataset.previewState === 'ready'), BUILTIN_CHARACTER_SLUGS.length);
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
            for (const slug of BUILTIN_CHARACTER_SLUGS) {
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
                const cadence = await page.evaluate(() => {
                    const avatar = window.demianGameApplication.activeGame.avatar;
                    const animation = avatar.animator.animation;
                    const result = {playbackRate:avatar.animator.playbackRate,cycleCount:animation.cycleCount,
                        strideHz:animation.cycleCount * animation.fps * avatar.animator.playbackRate / animation.frames.length,
                        expectedImageRevision:avatar.atlas.meta.imageRevision,
                        imageRevision:new URL(avatar.texture.image.src).searchParams.get('sprite_rev')};
                    avatar.qaJumpSamples = [];
                    avatar.qaOriginalSync = avatar.sync.bind(avatar);
                    avatar.sync = (actor, dt) => {
                        const value = avatar.qaOriginalSync(actor, dt);
                        if (actor.airborne) avatar.qaJumpSamples.push({state:avatar.state,frame:avatar.animator.currentFrameName()});
                        return value;
                    };
                    return result;
                });
                assert.ok(cadence.strideHz > 0 && cadence.strideHz < 1.7);
                assert.equal(cadence.imageRevision,cadence.expectedImageRevision,'Cached sprites must match the new atlas');
                if (slug === 'tiam') assert.ok(cadence.playbackRate < .55);
                await page.keyboard.down('Space');
                await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
                assert.ok(['takeoff','jump','fall'].includes(await page.evaluate(()=>window.demianGameApplication.activeGame.avatar.state)));
                await page.keyboard.up('Space');
                await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
                const jump = await page.evaluate(() => {
                    const avatar = window.demianGameApplication.activeGame.avatar;
                    const samples = avatar.qaJumpSamples;
                    avatar.sync = avatar.qaOriginalSync;
                    return {states:[...new Set(samples.map(s=>s.state))],
                        distinctFrames:new Set(samples.map(s=>s.frame)).size,
                        sources:samples.map(s=>Number(s.frame.split('_').at(-1)))};
                });
                assert.deepEqual(jump.states, ['takeoff','jump','fall']);
                assert.ok(jump.distinctFrames >= 10, 'Arms and legs must move throughout the real jump');
                assert.ok(jump.sources.every((n,i)=>i===0||n>=jump.sources[i-1]), 'Airborne poses must not restart');
                results.functional.push({ character:slug, selectedViaUi:true, nativeTouchSlide:'passed', birdCleared:'passed',
                    keyboardJump:'passed',cadence,jump:{states:jump.states,distinctFrames:jump.distinctFrames} });
            }
            await page.evaluate(() => { const a=window.demianGameApplication;a.runtime.pause();const g=a.activeGame;g.model.time=48;g.model.obstacles=[];g.render(1); });
            await page.screenshot({ path: resolve(screenshotDir, 'night-390.png') });
            await page.evaluate(() => { const a=window.demianGameApplication; const g=a.activeGame;g.model.time=32;g.render(1); });
            await page.screenshot({ path: resolve(screenshotDir, 'sunset-390.png') });
            await page.evaluate(async () => {
                const app = window.demianGameApplication;
                await app.characterManager.select(app.characterManager.characters.find(c => c.slug === 'negar').id);
                await app.launchGame('open-world');
            });
            await page.waitForFunction(() => window.demianGameApplication.activeGameId==='open-world' && window.demianGameApplication.sessionState==='playing');
            const world = await page.evaluate(() => ({ slug: window.demianGameApplication.characterManager.activeRecord.slug,
                slugs: window.demianGameApplication.characterManager.characters.map(c=>c.slug),
                actions: [...document.querySelectorAll('[data-mobile-actions-tray] [data-input-press]')].map(b=>b.dataset.inputPress) }));
            assert.equal(world.slug, 'negar'); assert.deepEqual(world.slugs.sort(), [...BUILTIN_CHARACTER_SLUGS].sort());
            assert.deepEqual(world.actions, ['slide','celebrate','ability','speak','quickSave']);
            await page.waitForTimeout(400); await page.screenshot({path:resolve(screenshotDir,'world-390.png')});
            results.functional.push({sharedSelectionAcrossGames:'passed',relevantActionPicker:'passed'});
            await page.evaluate(async () => {
                const app = window.demianGameApplication;
                await app.characterManager.select(app.characterManager.characters.find(c => c.slug === 'tiam').id);
                app.activeGame.focusCharacter({close:true});
            });
            await page.waitForFunction(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return e.character.slug === 'tiam' && e.grounded && e.stateLock <= 0;
            });
            const startX = await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.group.position.x);
            await page.keyboard.down('d'); await page.keyboard.down('Shift');
            await page.waitForTimeout(300);
            assert.ok((await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.group.position.x)) > startX + .03);
            await page.keyboard.up('d'); await page.keyboard.up('Shift');
            await page.waitForFunction(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return e.grounded && e.stateLock <= 0;
            });
            await page.keyboard.down('Space');
            await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
            await page.keyboard.up('Space');
            await page.waitForFunction(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return e.grounded && e.stateLock <= 0;
            });
            await page.keyboard.press('o');
            await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'celebrate');
            const tiam = await page.evaluate(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return {slug:e.character.slug,version:e.atlas.meta.version,companion:e.atlas.companion.id};
            });
            assert.deepEqual(tiam, {slug:'tiam',version:14,companion:'homayoun'});
            await page.screenshot({path:resolve(screenshotDir,'tiam-world-390.png')});
            results.functional.push({character:'tiam',openWorldMovement:'passed',openWorldJump:'passed',openWorldCelebrate:'passed',homayoun:'shoulder companion loaded'});
            await page.evaluate(async () => {
                const app = window.demianGameApplication;
                await app.characterManager.select(app.characterManager.characters.find(c => c.slug === 'amirreza').id);
                app.activeGame.focusCharacter({close:true});
            });
            await page.waitForFunction(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return e.character.slug === 'amirreza' && e.grounded && e.stateLock <= 0;
            });
            const amirrezaStart = await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.group.position.x);
            await page.keyboard.down('d'); await page.keyboard.down('Shift');
            await page.waitForTimeout(300);
            assert.ok((await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.group.position.x)) > amirrezaStart + .03);
            await page.keyboard.up('d'); await page.keyboard.up('Shift');
            await page.waitForFunction(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return e.grounded && e.stateLock <= 0;
            });
            await page.keyboard.down('Space');
            await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
            await page.keyboard.up('Space');
            await page.waitForFunction(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return e.grounded && e.stateLock <= 0;
            });
            await page.keyboard.press('o');
            await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'celebrate');
            const amirreza = await page.evaluate(() => {
                const e = window.demianGameApplication.characterManager.activeEntity;
                return {slug:e.character.slug,version:e.atlas.meta.version,style:e.atlas.movement.style,
                    settingsStyle:e.character.settings.locomotion_style,wingStates:e.atlas.movement.wingPoweredStates};
            });
            assert.deepEqual(amirreza, {slug:'amirreza',version:14,style:'wing-assisted',settingsStyle:'wing-assisted',
                wingStates:['run','sprint','takeoff','jump','fall','slide']});
            await page.screenshot({path:resolve(screenshotDir,'amirreza-world-390.png')});
            results.functional.push({character:'amirreza',openWorldMovement:'passed',openWorldJump:'passed',
                openWorldCelebrate:'passed',wingAssistedMetadata:'passed'});
            await page.evaluate(async () => {
                const app = window.demianGameApplication;
                await app.characterManager.select(app.characterManager.characters.find(c => c.slug === 'negar').id);
            });
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

            for (const slug of BUILTIN_CHARACTER_SLUGS) {
                await page.evaluate(async (expected) => {
                    const app=window.demianGameApplication;
                    await app.characterManager.select(app.characterManager.characters.find(c=>c.slug===expected).id);
                    app.activeGame.focusCharacter({close:true});
                },slug);
                await page.waitForFunction(() => {
                    const e=window.demianGameApplication.characterManager.activeEntity;
                    return e.grounded && e.stateLock<=0;
                });
                let gait;
                // Selection preserves the player's position; after several
                // characters a wall can block one direction. Verify real travel
                // in an available direction rather than accepting an idle pose.
                for (const key of ['d','a','w','s']) {
                    const before=await page.evaluate(() => {
                        const p=window.demianGameApplication.characterManager.activeEntity.group.position;
                        return {x:p.x,z:p.z};
                    });
                    await page.keyboard.down(key); await page.keyboard.down('Shift');
                    await page.waitForTimeout(220);
                    gait=await page.evaluate((start) => {
                        const e=window.demianGameApplication.characterManager.activeEntity;
                        return {state:e.state,phase:e.animator.locomotionPhase,frequency:e.animator.locomotionFrequency,
                            profile:e.atlas.motion.locomotionProfile.id,
                            distance:Math.hypot(e.group.position.x-start.x,e.group.position.z-start.z)};
                    },before);
                    await page.keyboard.up(key); await page.keyboard.up('Shift');
                    if (gait.distance>.08 && gait.frequency>.1 && ['walk','run','sprint'].includes(gait.state)) break;
                    await page.waitForTimeout(250);
                }
                assert.ok(gait.distance>.08 && gait.frequency>.1 && gait.frequency<=1.55,`${slug} must actually move`);
                await page.waitForFunction(() => {
                    const e=window.demianGameApplication.characterManager.activeEntity;
                    return e.grounded && e.stateLock<=0 && e.speed()<.015;
                });
                await page.evaluate(() => {
                    const e=window.demianGameApplication.characterManager.activeEntity;
                    e.qaMotion={firstPeak:0,secondPeak:0,rebounds:0,stage:0,samples:[[],[]],
                        start:{x:e.group.position.x,z:e.group.position.z}};
                    e.qaMotionUpdate=e.update.bind(e);
                    e.update=(dt,input,basis)=>{
                        const falling=!e.grounded && e.jumpVelocity<0;
                        e.qaMotionUpdate(dt,input,basis);
                        const t=e.qaMotion;
                        if (falling && !e.grounded && e.jumpVelocity>=e.jumpForce*.95) {t.rebounds++;t.stage=1;}
                        if (!e.grounded) {
                            const peak=t.stage===0?'firstPeak':'secondPeak';
                            t[peak]=Math.max(t[peak],e.bodyRoot.position.y);
                            t.samples[t.stage].push({state:e.state,frame:e.animator.currentFrameName()});
                        }
                    };
                });
                await page.keyboard.down('Space');
                await page.waitForFunction(() => {
                    const e=window.demianGameApplication.characterManager.activeEntity;
                    return !e.grounded && e.jumpVelocity < -4.5 && e.bodyRoot.position.y < .35;
                });
                await page.keyboard.up('Space'); await page.keyboard.down('Space');
                await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.qaMotion.rebounds===1);
                await page.keyboard.up('Space');
                await page.waitForFunction(() => {
                    const e=window.demianGameApplication.characterManager.activeEntity;
                    return e.grounded && e.stateLock<=0;
                });
                const motion=await page.evaluate(() => {
                    const e=window.demianGameApplication.characterManager.activeEntity,t=e.qaMotion;
                    e.update=e.qaMotionUpdate;
                    return {firstPeak:t.firstPeak,secondPeak:t.secondPeak,rebounds:t.rebounds,
                        neutralJumpDrift:Math.hypot(e.group.position.x-t.start.x,e.group.position.z-t.start.z),
                        jumps:t.samples.map(samples=>({states:[...new Set(samples.map(s=>s.state))],
                            distinctFrames:new Set(samples.map(s=>s.frame)).size,
                            monotonic:samples.every((s,i)=>!i||Number(s.frame.split('_').at(-1))>=Number(samples[i-1].frame.split('_').at(-1)))}))};
                });
                assert.equal(motion.rebounds,1,'The queued jump must start on the landing tick');
                assert.ok(motion.neutralJumpDrift<.03,'A neutral jump must not inject forward movement');
                assert.ok(motion.firstPeak>motion.secondPeak+.12,'Holding jump must reach higher than a short press');
                for(const jump of motion.jumps) {
                    assert.deepEqual(jump.states,['takeoff','jump','fall']);
                    assert.ok(jump.distinctFrames>=10 && jump.monotonic);
                }
                results.functional.push({character:slug,smoothWorldLocomotion:gait,bufferedLandingJump:'passed',heldJumpHeight:'passed',motion});
            }

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
