import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { characterReferenceBodyHeightRatio } from '../resources/js/game/characters/CharacterVisualContract.js';

const character = process.argv[2] ?? 'arsal';
assert.ok(['arsal', 'darya'].includes(character));
const project = resolve(import.meta.dirname, '..');
const playable = resolve(process.env.DEMIAN_QA_SITE ?? resolve(project, '../playable'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/dcs-v15'));
const screenshots = resolve(process.env.DEMIAN_QA_SCREENSHOT_DIR ?? resolve(tmpdir(), 'demian-' + character + '-v15'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const referenceFile = resolve(project, 'public/assets/characters/arsal/arsal-atlas-v15-mobile.json');
const referenceRunner = JSON.parse(await readFile(referenceFile, 'utf8')).sideViewAnimations;
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
await mkdir(out, { recursive:true });
await mkdir(screenshots, { recursive:true });
const server = createServer(async (request, response) => {
    try {
        let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = resolve(playable, `.${path}`);
        if (!file.startsWith(`${playable}/`)) throw new Error('Outside export');
        const bytes = await readFile(file);
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless:true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args:process.env.DEMIAN_BROWSER_ARGS ? JSON.parse(process.env.DEMIAN_BROWSER_ARGS) : ['--no-sandbox','--disable-gpu'] });
const report = { character, browser:browser.version(), physicalPhoneMeasured:false, viewports:[], status:'running' };
async function visibleBodyScale(page, mode) {
    const meta = await page.evaluate(mode => {
        const app = window.demianGameApplication;
        return (mode === 'runner' ? app.activeGame.avatar : app.characterManager.activeEntity).atlas.meta;
    }, mode);
    const runnerRatio = characterReferenceBodyHeightRatio({ meta }, { sideView: true });
    return page.evaluate(({ mode, runnerRatio }) => {
        const app = window.demianGameApplication;
        const entity = mode === 'runner' ? app.activeGame.avatar : app.characterManager.activeEntity;
        const atlas = entity.atlas, image = entity.texture.image;
        const referenceRatio = mode === 'runner' ? runnerRatio : atlas.display.worldHeight / entity.baseHeight;
        const clips = entity.animator.animations;
        const cell = atlas.meta.frameSize.w;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = cell;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        function height(name) {
            const f=atlas.frames[name]; ctx.clearRect(0,0,cell,cell);
            ctx.drawImage(image,f.x,f.y,f.w,f.h,0,0,cell,cell);
            const pixels=ctx.getImageData(0,0,cell,cell).data;
            let top=cell,bottom=-1;
            for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(pixels[(y*cell+x)*4+3]>32){top=Math.min(top,y);bottom=Math.max(bottom,y);}
            return (bottom-top+1)/cell;
        }
        const ratios = {};
        for(const state of ['idle','walk','run','sprint']) {
            const heights=clips[state].frames.map(height).sort((a,b)=>a-b);
            const n=heights.length;
            ratios[state]=(heights[Math.floor((n-1)/2)]+heights[Math.floor(n/2)])/2/referenceRatio;
        }
        return {ratios,jumpRecoveryRatio:height(clips.land.frames.at(-1))/referenceRatio,
            airborneRatio:clips.jump.frames.map(height).sort((a,b)=>a-b)[Math.floor(clips.jump.frames.length/2)]/referenceRatio,
            frameWorldHeight:entity.baseHeight??null,
            currentWorldHeight:mode==='world'?height(entity.animator.currentFrameName())*entity.baseHeight:null,
            bodyScale:entity.bodyRoot?.scale?.y??1,variant:atlas.meta.variant};
    }, { mode, runnerRatio });
}
try {
    for (const [width, height] of [[390,844], [1440,900]]) {
        const mobile = width < 1024;
        const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile });
        const page = await context.newPage();
        const press = locator => mobile ? locator.tap() : locator.click();
        const errors = [], failures = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failures.push(new URL(response.url()).pathname); });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, {timeout:45000});
        const id = 'builtin-' + character;
        await press(page.locator('.menu-character-button'));
        await page.locator(`[data-character-card="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForFunction(expected => document.querySelector(`[data-character-card="${expected}"] [data-character-preview]`)?.dataset.previewState === 'ready', id);
        await press(page.locator(`[data-select-character="${id}"]`));
        await page.waitForFunction(slug => window.demianGameApplication.characterVisuals.activeSlug === slug, character);
        if (!mobile) await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'collapsed');
        await page.evaluate(() => window.demianGameApplication.launchGame('dino-run', {seed:127}));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.model?.status === 'ready');
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.avatar.slug), character);
        const runnerGaits = await page.evaluate(() => {
            const { animations } = window.demianGameApplication.activeGame.avatar.animator;
            return Object.fromEntries(['run', 'sprint'].map(state => {
                const { frames, fps, cycleCount } = animations[state];
                return [state, { frames: frames.length, fps, cycleCount }];
            }));
        });
        for (const state of ['run', 'sprint']) {
            const { frames, fps, cycleCount } = referenceRunner[state];
            assert.deepEqual(runnerGaits[state], { frames: frames.length, fps, cycleCount });
        }
        const runnerBodyScale = await visibleBodyScale(page, 'runner');
        assert.ok(runnerBodyScale.jumpRecoveryRatio >= .96 && runnerBodyScale.jumpRecoveryRatio <= 1.05);
        assert.ok(runnerBodyScale.airborneRatio >= .75 && runnerBodyScale.airborneRatio <= 1.05);
        for(const [state, ratio] of Object.entries(runnerBodyScale.ratios)) {
            assert.ok(ratio >= .96 && ratio <= 1.05, `Runner ${state} visible height must match the canonical body: ${ratio}`);
        }
        await press(page.locator('.runner-ready:not(.runner-lesson) [data-input-press="jump"]'));
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'running');
        await page.evaluate(() => { const model = window.demianGameApplication.activeGame.model; model.spawnIn = 999; model.obstacles = []; });
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
        if (mobile) await page.locator('.runner-controls__jump').tap();
        else await page.keyboard.down('Space');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
        if (!mobile) await page.keyboard.up('Space');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
        let touch;
        if (mobile) {
            touch = await context.newCDPSession(page);
            const duck = page.locator('.runner-controls__duck');
            await duck.waitFor({state:'visible'});
            const box = await duck.boundingBox();
            assert.ok(box, 'The runner slide button must have a touch target');
            await touch.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
        } else await page.keyboard.down('ArrowDown');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.state === 'slide');
        await page.evaluate(() => {
            window.demianGameApplication.activeGame.model.obstacles = [{id:1,type:'bird',x:104,previousX:104,y:46,w:40,h:22,scored:false}];
        });
        await page.waitForTimeout(180);
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.status), 'running');
        const pack = await page.evaluate(() => {
            const avatar = window.demianGameApplication.activeGame.avatar;
            return {variant:avatar.atlas.meta.variant, version:avatar.atlas.meta.version,
                actualRevision:new URL(avatar.texture.image.src).searchParams.get('sprite_rev'),
                expectedRevision:avatar.atlas.meta.imageRevision};
        });
        assert.equal(pack.actualRevision, pack.expectedRevision);
        assert.equal(pack.version, 15);
        assert.match(await page.evaluate(() => window.demianGameApplication.activeGame.avatar.animator.currentFrameName()), /^side_slide_e_/);
        await page.screenshot({path:resolve(screenshots, `${character}-slide-${width}.png`)});
        if (touch) await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        else await page.keyboard.up('ArrowDown');
        await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(() => window.demianGameApplication.activeGameId === 'open-world' && window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({close:true}));
        await page.waitForFunction(slug => { const e=window.demianGameApplication.characterManager.activeEntity; return e.character.slug === slug && e.grounded && e.stateLock<=0; }, character);
        let distance = 0;
        let walkScale, runScale;
        for (const key of ['d','a','w','s']) {
            const start = await page.evaluate(() => { const p=window.demianGameApplication.characterManager.activeEntity.group.position; return {x:p.x,z:p.z}; });
            await page.keyboard.down(key);
            await page.waitForTimeout(260);
            walkScale = await visibleBodyScale(page, 'world');
            await page.screenshot({path:resolve(screenshots, `${character}-walk-${width}.png`)});
            await page.keyboard.down('Shift');
            await page.waitForTimeout(300);
            runScale = await visibleBodyScale(page, 'world');
            await page.screenshot({path:resolve(screenshots, `${character}-run-${width}.png`)});
            distance = await page.evaluate(start => { const p=window.demianGameApplication.characterManager.activeEntity.group.position; return Math.hypot(p.x-start.x,p.z-start.z); }, start);
            await page.keyboard.up(key); await page.keyboard.up('Shift');
            if (distance > .03) break;
        }
        assert.ok(distance > .03, character + ' must move in the cafe');
        for(const scale of [walkScale,runScale]) {
            assert.ok(scale.currentWorldHeight >= 3.05 && scale.currentWorldHeight <= 4.05, 'Moving world silhouette must stay full-sized');
            assert.equal(scale.bodyScale,1);
            assert.ok(scale.ratios.idle >= .95 && scale.ratios.idle <= 1.05);
            assert.ok(scale.ratios.walk >= .88 && scale.ratios.walk <= 1.05);
            assert.ok(scale.ratios.run >= .82 && scale.ratios.run <= 1.05);
        }
        assert.equal(walkScale.frameWorldHeight,runScale.frameWorldHeight);
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock<=0; });
        const observed = new Set();
        for (const keys of [['d'], ['d','s'], ['s'], ['a','s'], ['a'], ['a','w'], ['w'], ['d','w']]) {
            for (const key of keys) await page.keyboard.down(key);
            await page.waitForTimeout(100);
            await page.waitForFunction(() => {
                const actor = window.demianGameApplication.characterManager.activeEntity;
                return actor.state === 'walk' && actor.animator.currentFrameName()?.startsWith('world_');
            });
            const { direction, frame, version } = await page.evaluate(() => {
                const actor = window.demianGameApplication.characterManager.activeEntity;
                return { direction: actor.direction, frame: actor.animator.currentFrameName(), version: actor.atlas.meta.version };
            });
            assert.equal(version, 15);
            assert.ok(frame.startsWith('world_' + direction + '_walk-'), frame);
            observed.add(direction);
            for (const key of keys) await page.keyboard.up(key);
        }
        assert.deepEqual([...observed].sort(), ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
        await page.keyboard.down('Space');
        await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
        await page.keyboard.up('Space');
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock<=0; });
        await page.keyboard.press('o');
        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'celebrate');
        await page.screenshot({path:resolve(screenshots, `${character}-world-${width}.png`)});
        const games = ['open-world', 'dino-run'];
        for (const gameId of ['after-hours','cafe-rush','cafe-critters','coffee-crash','cafe-drift']) {
            await page.evaluate(gameId => window.demianGameApplication.launchGame(gameId), gameId);
            await page.waitForFunction(gameId => window.demianGameApplication.activeGameId === gameId
                && window.demianGameApplication.sessionState === 'playing', gameId, {timeout: 45000});
            if (gameId === 'after-hours' || gameId === 'cafe-rush') {
                const avatar = await page.evaluate(() => {
                    const game = window.demianGameApplication.activeGame;
                    const avatar = game.avatar ?? game.avatars?.player;
                    return { slug: avatar?.slug, version: avatar?.atlas.meta.version };
                });
                assert.deepEqual(avatar, { slug: character, version: 15 });
            }
            games.push(gameId);
        }
        await page.reload();
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        assert.equal(await page.evaluate(() => window.demianGameApplication.characterVisuals.activeSlug), character);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1), false);
        assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        report.viewports.push({width,height,selectedViaUi:true,previewLoaded:true,runnerJump:'passed',
            slide:mobile?'native-touch-passed':'keyboard-passed',birdCleared:true,pack,
            cafeMovement:'passed',cafeJump:'passed',cafeCelebrate:'passed',selectionSurvivesReload:true,
            runnerGaits,runnerBodyScale,walkScale,runScale,directions:[...observed],games,errors,failures});
        await context.close();
        console.log(`${character} browser QA passed: ${width}x${height}`);
    }
    report.status = 'passed';
} catch (error) {
    report.status='failed'; report.error=error.stack;
    for (const context of browser.contexts()) for (const page of context.pages()) {
        await page.screenshot({path:resolve(screenshots,'failure.png')}).catch(()=>{});
    }
    throw error;
} finally {
    await writeFile(resolve(out,character + '-browser-checks.json'), JSON.stringify(report,null,2)+'\n');
    await browser.close(); await new Promise(done=>server.close(done));
}
