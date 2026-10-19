/** Optional Ainaz browser QA; uses the same Playwright overrides as other V14 checks. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const project = resolve(import.meta.dirname, '..');
const playable = resolve(project, '../playable');
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/release-v14-ainaz'));
const screenshots = resolve(process.env.DEMIAN_QA_SCREENSHOT_DIR ?? resolve(tmpdir(), 'demian-ainaz-v14'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
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
const report = { character:'ainaz', browser:browser.version(), physicalPhoneMeasured:false, viewports:[], status:'running' };
async function visibleBodyScale(page, mode) {
    return page.evaluate(mode => {
        const app = window.demianGameApplication;
        const entity = mode === 'runner' ? app.activeGame.avatar : app.characterManager.activeEntity;
        const atlas = entity.atlas, image = entity.texture.image;
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
            const heights=atlas.animations[state].frames.map(height).sort((a,b)=>a-b);
            const n=heights.length;
            ratios[state]=(heights[Math.floor((n-1)/2)]+heights[Math.floor(n/2)])/2/atlas.render.referenceBodyHeightRatio;
        }
        return {ratios,frameWorldHeight:entity.baseHeight??null,
            currentWorldHeight:mode==='world'?height(entity.animator.currentFrameName())*entity.baseHeight:null,
            bodyScale:entity.bodyRoot?.scale?.y??1,variant:atlas.meta.variant};
    }, mode);
}
try {
    for (const [width, height] of [[390,844], [1440,900]]) {
        const mobile = width < 1024;
        const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile });
        const page = await context.newPage();
        const errors = [], failures = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failures.push(new URL(response.url()).pathname); });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, {timeout:45000});
        const id = await page.evaluate(() => window.demianGameApplication.characterManager.characters.find(c => c.slug === 'ainaz')?.id);
        assert.ok(id);
        await page.locator('.menu-character-button').click();
        await page.locator(`[data-character-card="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForFunction(expected => document.querySelector(`[data-character-card="${expected}"] [data-character-preview]`)?.dataset.previewState === 'ready', id);
        await page.locator(`[data-select-character="${id}"]`).click();
        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeRecord.slug === 'ainaz');
        // Desktop keeps the character drawer open after selection; close it
        // through the real control so gameplay input can resume.
        if (await page.evaluate(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'expanded')) {
            await page.locator('.character-sheet-close').click();
        }
        await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'collapsed');
        await page.evaluate(() => window.demianGameApplication.launchGame('dino-run', {seed:127}));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.model?.status === 'ready');
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.avatar.slug), 'ainaz');
        const runnerBodyScale = await visibleBodyScale(page, 'runner');
        for(const [state, ratio] of Object.entries(runnerBodyScale.ratios)) {
            assert.ok(ratio >= .96 && ratio <= 1.05, `Runner ${state} visible height must match the canonical body: ${ratio}`);
        }
        await page.locator('.runner-ready button').click();
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'running');
        await page.evaluate(() => { const model = window.demianGameApplication.activeGame.model; model.spawnIn = 999; model.obstacles = []; });
        await page.keyboard.down('Space');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
        await page.keyboard.up('Space');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
        let touch;
        if (mobile) {
            touch = await context.newCDPSession(page);
            const box = await page.locator('.runner-controls__duck').boundingBox();
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
        assert.equal(pack.version, 14);
        await page.screenshot({path:resolve(screenshots, `ainaz-slide-${width}.png`)});
        if (touch) await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        else await page.keyboard.up('ArrowDown');
        await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(() => window.demianGameApplication.activeGameId === 'open-world' && window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({close:true}));
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.character.slug === 'ainaz' && e.grounded && e.stateLock<=0; });
        let distance = 0;
        let walkScale, runScale;
        for (const key of ['d','a','w','s']) {
            const start = await page.evaluate(() => { const p=window.demianGameApplication.characterManager.activeEntity.group.position; return {x:p.x,z:p.z}; });
            await page.keyboard.down(key);
            await page.waitForTimeout(260);
            walkScale = await visibleBodyScale(page, 'world');
            await page.screenshot({path:resolve(screenshots, `ainaz-walk-${width}.png`)});
            await page.keyboard.down('Shift');
            await page.waitForTimeout(300);
            runScale = await visibleBodyScale(page, 'world');
            await page.screenshot({path:resolve(screenshots, `ainaz-run-${width}.png`)});
            distance = await page.evaluate(start => { const p=window.demianGameApplication.characterManager.activeEntity.group.position; return Math.hypot(p.x-start.x,p.z-start.z); }, start);
            await page.keyboard.up(key); await page.keyboard.up('Shift');
            if (distance > .03) break;
        }
        assert.ok(distance > .03, 'Ainaz must move in the cafe');
        for(const scale of [walkScale,runScale]) {
            assert.ok(scale.currentWorldHeight >= 3.45 && scale.currentWorldHeight <= 4.05, 'Moving world silhouette must stay full-sized');
            assert.equal(scale.bodyScale,1);
            for(const ratio of Object.values(scale.ratios))assert.ok(ratio>=.96 && ratio<=1.05);
        }
        assert.equal(walkScale.frameWorldHeight,runScale.frameWorldHeight);
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock<=0; });
        await page.keyboard.down('Space');
        await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
        await page.keyboard.up('Space');
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock<=0; });
        await page.keyboard.press('o');
        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'celebrate');
        await page.screenshot({path:resolve(screenshots, `ainaz-world-${width}.png`)});
        await page.reload();
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        assert.equal(await page.evaluate(() => window.demianGameApplication.characterManager.activeRecord.slug), 'ainaz');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1), false);
        assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        report.viewports.push({width,height,selectedViaUi:true,previewLoaded:true,runnerJump:'passed',
            slide:mobile?'native-touch-passed':'keyboard-passed',birdCleared:true,pack,
            cafeMovement:'passed',cafeJump:'passed',cafeCelebrate:'passed',selectionSurvivesReload:true,
            runnerBodyScale,walkScale,runScale,errors,failures});
        await context.close();
        console.log(`Ainaz browser QA passed: ${width}x${height}`);
    }
    report.status = 'passed';
} catch (error) {
    report.status='failed'; report.error=error.stack;
    for (const context of browser.contexts()) for (const page of context.pages()) {
        await page.screenshot({path:resolve(screenshots,'failure.png')}).catch(()=>{});
    }
    throw error;
} finally {
    await writeFile(resolve(out,'browser-checks.json'), JSON.stringify(report,null,2)+'\n');
    await browser.close(); await new Promise(done=>server.close(done));
}
