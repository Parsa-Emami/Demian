import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const root=resolve(import.meta.dirname,'../..'),playable=resolve(root,'playable');
const out=resolve(root,'demian/docs/validation/cafe-runner-platform');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
    try {
        const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=resolve(playable,`.${path.endsWith('/')?path+'index.html':path}`);
        if(!file.startsWith(playable+'/'))throw new Error('Invalid path');
        let data=await readFile(file);
        if(file.endsWith('index.html')&&process.env.DEMIAN_QA_ARCADE_API)data=Buffer.from(data.toString().replace('name="demian-arcade-api" content=""',`name="demian-arcade-api" content="${process.env.DEMIAN_QA_ARCADE_API}"`));
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(data);
    } catch {res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(4173,'127.0.0.1',done));
const browser=await chromium.launch({headless:true,...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const report={browser:browser.version(),rendering:'headless software Chromium',physicalDeviceMeasured:false,profile:'emulated 4 GiB memory and 4 CPU cores',viewports:[],errors:[]};
try {
    const sizes=process.env.DEMIAN_QA_ARCADE_API?[[390,844]]:[[1440,900],[390,844],[844,390]];
    for(const [width,height] of sizes) {
        const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<1000,hasTouch:width<1000});
        const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
        await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>4});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});});
        await page.goto('http://127.0.0.1:4173/');
        await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',null,{timeout:45000});
        await page.evaluate(()=>document.fonts.ready);
        await page.locator('[data-screen="cafe-menu"] [data-shell-action="leaderboard"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-screen="leaderboard"]').dataset.screenState==='active');
        assert.equal(await page.locator('[data-ranking-period]').inputValue(),process.env.DEMIAN_QA_ARCADE_API?'all':'device');
        await page.locator('[data-ranking-name-form] input').fill('Parsa QA');await page.locator('[data-ranking-name-form] button').click();
        await page.waitForFunction(()=>document.querySelector('[data-ranking-status]').textContent.includes('ذخیره'));
        await page.locator('[data-screen="leaderboard"] [data-shell-action="close-modal"]').click();
        await page.evaluate(online=>window.demianGameApplication.launchGame('dino-run',online?{}:{seed:127}),Boolean(process.env.DEMIAN_QA_ARCADE_API));
        await page.waitForFunction(()=>window.demianGameApplication.activeGame.model.status==='ready');
        const ready=await page.evaluate(()=>{
            const app=window.demianGameApplication,game=app.activeGame;
            return{mode:game.run.mode,backgroundLoaded:Boolean(game.environment.image),difficulty:game.model.difficulty.level,
                roster:game.characterManager.characters.length,overflow:document.documentElement.scrollWidth>innerWidth+1};
        });
        assert.equal(ready.backgroundLoaded,true);assert.equal(ready.difficulty,6);assert.equal(ready.roster,12);assert.equal(ready.overflow,false);
        assert.equal(ready.mode,process.env.DEMIAN_QA_ARCADE_API?'ranked':'practice');
        await page.screenshot({path:resolve(out,`ready-${width}x${height}.png`)});
        if(!process.env.DEMIAN_QA_ARCADE_API&&width!==844) {
            for(const slug of ['tiam','amirreza','hanna','ainaz','arsal','iman','amin','hossein']) {
                await page.evaluate(slug=>window.demianGameApplication.activeGame.selectCharacter(slug),slug);
                const sample=await page.evaluate(()=>{
                    const app=window.demianGameApplication,g=app.activeGame;app.runtime.pause({notifyGame:false});
                    g.model.status='running';g.model.time=1;g.actor.speed=6.9;g.actor.motionState='run';g.actor.travelledDistance=.115;
                    for(let i=0;i<25;i++)g.avatar.sync(g.actor,1/60);
                    g.render(1);return{slug:g.avatar.slug,state:g.avatar.state,frequency:g.avatar.animator.locomotionFrequency};
                });
                assert.equal(sample.slug,slug);assert.ok(sample.frequency>0&&sample.frequency<=1.55);
                await page.screenshot({path:resolve(out,`${slug}-${width}.png`)});
                await page.evaluate(()=>{const a=window.demianGameApplication;a.activeGame.model.status='ready';a.runtime.resume({notifyGame:false});});
            }
        }
        await page.evaluate(()=>window.demianGameApplication.restartGame());
        await page.waitForFunction(()=>window.demianGameApplication.activeGame.model.status==='ready');
        await page.keyboard.down('Space');await page.waitForTimeout(150);await page.keyboard.up('Space');
        await page.waitForFunction(()=>window.demianGameApplication.sessionState==='results',null,{timeout:20000});
        await page.waitForFunction(()=>!document.querySelector('[data-results-ranking]').textContent.includes('بررسی'),null,{timeout:15000});
        const ranking=await page.locator('[data-results-ranking]').textContent();
        assert.ok(ranking.includes(process.env.DEMIAN_QA_ARCADE_API?'تأیید':'دستگاه'),ranking);
        await page.locator('[data-screen="results"] [data-shell-action="leaderboard"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-ranking-rows]').children.length>0);
        await page.screenshot({path:resolve(out,`leaderboard-${width}x${height}.png`)});
        report.viewports.push({width,height,...ready,ranking});await context.close();
    }
    assert.deepEqual(report.errors,[]);
    await writeFile(resolve(out,process.env.DEMIAN_QA_ARCADE_API?'api-browser.json':'browser.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
} finally {await browser.close();await new Promise(done=>server.close(done));}
