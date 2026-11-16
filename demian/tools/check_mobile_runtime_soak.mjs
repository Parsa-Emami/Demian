/**
 * Runtime optimization browser QA. Exercises all six games, real Open World
 * streaming churn, and local 30s-window diagnostics. CI is a LAB result,
 * not a physical-phone thermal or memory certification.
 */
import assert from 'node:assert/strict';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root=resolve(import.meta.dirname,'../_site');
const output=resolve(import.meta.dirname,'../docs/mobile-runtime');
mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css',
    '.json':'application/json','.woff2':'font/woff2','.png':'image/png',
    '.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
    try{
        const url=new URL(req.url,'http://localhost');
        const path=decodeURIComponent(url.pathname);
        if(path.includes('\\')||path.split('/').includes('..')) throw Error('unsafe');
        const file=resolve(root,path.replace(/^\/+/, '')||'index.html');
        if(!file.startsWith(root+sep)||!statSync(file).isFile())throw Error('not found');
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
        createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch{res.writeHead(404);res.end('Not found')}
});
const games=['open-world','dino-run','after-hours','cafe-rush','cafe-critters','coffee-crash'];
const report={status:'pending', evidenceType:'headless-chromium-mobile-emulation',
    physicalPhoneVerified:false,thermalState:null,nativeGpuMemoryBytes:null,
    gameRuns:[],chunkTeleports:[],runtime:null,errors:[],
    limitations:[
        'Browser loop is shorter than a real 15-minute phone session and cannot reproduce thermal throttling.',
        'CPU time is JavaScript callback time, not full GPU workload or battery consumption.',
        'JS heap and decoded-cache estimates exclude native GPU/process allocations.',
        'This is not physical Android/iOS or installed PWA evidence.',
    ]};
let browser;
try{
    await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
    const {chromium}=await import('playwright');
    browser=await chromium.launch({headless:true,
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const context=await browser.newContext({viewport:{width:390,height:844},
        deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'});
    try{
        const page=await context.newPage();
        page.on('pageerror',error=>report.errors.push(error.message));
        await page.goto('http://127.0.0.1:'+server.address().port+'/?deviceQa=1',
            {waitUntil:'domcontentloaded',timeout:90000});
        await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',
            null,{timeout:45000});
        await page.evaluate(()=>{
            const app=window.demianGameApplication;
            app.deviceQa.session.start({scenario:'CI runtime soak, physical-phone-unverified'});
            app.deviceQa.soak.start();
        });
        for(const game of games){
            await page.evaluate(id=>window.demianGameApplication.launchGame(id),game);
            await page.waitForFunction(id=>{
                const app=window.demianGameApplication;
                return app?.sessionState==='playing'&&app?.activeGameId===id;
            },game,{timeout:70000});
            await page.waitForTimeout(game==='open-world'?7000:1800);
            const observed=await page.evaluate(()=>{
                const app=window.demianGameApplication, game=app.activeGame;
                return{id:app.activeGameId,renderFps:Number(app.root.dataset.renderFps),
                    chunkStats:game.chunkManager?.stats()??null,
                    staticCache:game.pixelRenderer?.sceneCache?.stats()??null,
                    spriteMemory:app.characterVisuals?.memorySnapshot()??null};
            });
            assert.equal(observed.id,game);
            if(observed.chunkStats)assert.ok(observed.chunkStats.loaded<=observed.chunkStats.maxLoadedChunks);
            if(game==='open-world'){
                for(let i=0;i<18;i++){
                    const x=await page.evaluate(async index=>{
                        const g=window.demianGameApplication.activeGame;
                        const points=g.manifest.savePoints;
                        const point=points[index%points.length];
                        g.savePoints.activate(point.id);
                        if(!(await g.fastTravel(point)))throw Error('Fast travel unexpectedly rejected.');
                        await g.chunkManager.whenIdle();
                        return{...g.chunkManager.stats(),handles:g.chunkRenderer.handles.size};
                    },i);
                    assert.ok(x.loaded<=x.maxLoadedChunks);
                    assert.ok(x.handles<=x.maxLoadedChunks);
                    assert.equal(x.queued,0);
                    assert.equal(x.loading,0);
                    report.chunkTeleports.push(x);
                }
            }
            report.gameRuns.push(observed);
            await page.evaluate(()=>window.demianGameApplication.showMenu());
            await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',
                null,{timeout:30000});
        }
        report.runtime=await page.evaluate(()=>{
            const qa=window.demianGameApplication.deviceQa;
            qa.session.stop();
            qa.soak.stop();
            return qa.soak.report();
        });
        assert.ok(report.runtime.sampledFrames>120,'No sustained frames captured');
        assert.deepEqual(Object.keys(report.runtime.games).sort(),games.slice().sort());
        assert.ok(report.runtime.games['open-world'].peakLoadedChunks<=
            report.gameRuns[0].chunkStats.maxLoadedChunks);
        assert.deepEqual(report.errors,[],'No uncaught browser exceptions');
        report.status='passed';
        console.log('Mobile Runtime browser soak: PASSED',report.runtime.sampledFrames,'frames, six games, 18 teleport churn passes');
    }finally{await context.close()}
}catch(error){
    report.status='failed';
    report.failure=String(error.stack??error);
    console.error(report.failure);
    throw error;
}finally{
    writeFileSync(resolve(output,'runtime-soak-browser.json'),
        JSON.stringify(report,null,2)+'\n');
    await browser?.close();
    await new Promise(ok=>server.close(ok));
}
