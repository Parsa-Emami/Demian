import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const site = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(import.meta.dirname,'../_site'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(import.meta.dirname,'../docs/phase06-environment/qa'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const media = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
    '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
const profiles = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
];
const scenarios = [{ id:'cafe-rush', light:'day' }, { id:'after-hours', light:'night' }];
const otherGames = ['open-world','dino-run','cafe-critters','coffee-crash','cafe-drift'];
const report = {
    phase:6, status:'running', machineVerified:false, humanVisualApproval:false,
    physicalDeviceMeasured:false, testProfiles:profiles, scenes:[],
};
await mkdir(out,{recursive:true});
const server=createServer(async(request,response)=>{
    try {
        let uri = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
        if (uri.endsWith('/')) uri+='index.html';
        const path = resolve(site,'.'+uri);
        if (!path.startsWith(site+sep)) throw Error('outside release');
        const bytes=await readFile(path);
        response.writeHead(200, {'Content-Type':media[extname(path)] ?? 'application/octet-stream'});
        response.end(bytes);
    } catch {
        response.writeHead(404);response.end();
    }
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try {
    browser=await chromium.launch({headless:true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),
        args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
            '--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    report.browser=browser.version();
    for(const {width,height} of profiles){
        const mobile=width<=390;
        const context=await browser.newContext({viewport:{width,height},
            deviceScaleFactor:mobile?2:1,hasTouch:mobile,isMobile:mobile});
        await context.addInitScript(({mobile})=>{
            Object.defineProperty(navigator,'deviceMemory',{get:()=>mobile?2:8});
            Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>mobile?4:12});
        },{mobile});
        const page=await context.newPage();
        page.setDefaultTimeout(45000);
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu');
        const cases=[...scenarios, ...(width===390?otherGames.map(id=>({id,light:'game-default'})):[])];
        for(const {id,light} of cases){
            await page.evaluate(async gameId=>{
                await window.demianGameApplication.launchGame(gameId);
            },id);
            await page.waitForFunction(gameId=>{
                const app=window.demianGameApplication;
                return app?.activeGameId===gameId && app?.sessionState==='playing';
            },id);
            await page.waitForTimeout(180);
            const detail=await page.evaluate(()=>{
                const app=window.demianGameApplication;
                const canvas=app.rendererService.canvas;
                const actual=app.rendererService.logicalDimensions();
                const rect=canvas.getBoundingClientRect();
                const world=app.activeGame?.renderer?.scene;
                return {
                    gameId:app.activeGameId,
                    quality:world?.cafe?.stream?.profile?.quality
                        ?? app.activeGame?.pixelRenderer?.cafe?.stream?.profile?.quality ?? null,
                    logicalWidth:actual.width, logicalHeight:actual.height,
                    canvasCss:{width:rect.width,height:rect.height},
                    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
                    runtimeErrors:[...app.runtime.errorCounts.keys()],
                };
            });
            assert.equal(detail.gameId,id);
            assert.ok(detail.canvasCss.width>0&&detail.canvasCss.height>0,id+' empty canvas');
            assert.ok(detail.logicalWidth>0&&detail.logicalHeight>0,id+' invalid buffer');
            assert.ok(detail.logicalWidth*detail.logicalHeight<=2200000,id+' pixel budget');
            assert.equal(detail.horizontalOverflow,false,id+' horizontal overflow '+width);
            assert.deepEqual(detail.runtimeErrors,[],id+' simulation errors');
            assert.deepEqual(errors,[],id+' browser errors');
            const filename=`phase06-${width}x${height}-${id}.png`;
            const bytes=await page.screenshot({path:resolve(out,filename),animations:'disabled'});
            assert.ok(bytes.length>3000,id+' suspiciously empty screenshot');
            report.scenes.push({viewport:{width,height},light,file:filename,bytes:bytes.length,...detail});
        }
        await context.close();
    }
    assert.equal(report.scenes.length,13,'4 viewport pairs + 5 mobile title captures');
    report.machineVerified=true;
    report.status='passed';
} catch(error) {
    report.status='failed';
    report.error=error.stack??String(error);
    for(const context of browser?.contexts()??[])
        for(const page of context.pages())
            await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>undefined);
    throw error;
} finally {
    await writeFile(resolve(out,'phase06-visual-qa.json'),JSON.stringify(report,null,2)+'\n');
    await browser?.close();
    await new Promise(done=>server.close(done));
}
