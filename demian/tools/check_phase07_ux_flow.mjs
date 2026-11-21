import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const release=resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(import.meta.dirname,'../_site'));
const out=resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(import.meta.dirname,'../docs/phase07-ux/qa'));
const { chromium }=await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png',
    '.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2',
    '.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const report={phase:7,status:'running',machineVerified:false,humanAudioApproval:false,
    physicalDeviceMeasured:false,profiles:[],audioArtwork:'procedural-unmastered'};
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
    try{
        let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(path.endsWith('/'))path+='index.html';
        const file=resolve(release,'.'+path);
        if(!file.startsWith(release+sep)) throw Error('outside release');
        const data=await readFile(file);
        res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});
        res.end(data);
    }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
    browser=await chromium.launch({headless:true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),
        args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
            '--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    for(const size of [{width:320,height:568},{width:390,height:844}]){
        const context=await browser.newContext({viewport:size,deviceScaleFactor:2,
            hasTouch:true,isMobile:true,reducedMotion:'reduce'});
        const page=await context.newPage();page.setDefaultTimeout(50000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const origin='http://127.0.0.1:'+server.address().port;
        await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu');
        const menu=page.locator('[data-screen="cafe-menu"]');
        assert.equal(await menu.isVisible(),true);
        await menu.locator('[data-shell-action="play"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-screen="game-selection"]')?.hidden===false);
        assert.equal(await page.locator('[data-game-grid] [data-game-card]').count(),7);
        assert.equal(await page.locator('[data-game-grid] .game-card__scene-preview img').count(),7);
        assert.equal(await page.locator('[data-game-grid] [data-game-design-guide]').count(),7);
        assert.equal(await page.locator('[data-game-grid] [aria-disabled="true"]').count(),0);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
        await page.screenshot({path:resolve(out,`phase07-${size.width}-selection.png`),animations:'disabled'});
        await page.locator('[data-screen="game-selection"] [data-shell-action="back-cafe"]').click();
        await menu.locator('[data-shell-action="settings"]').click();
        const settings=page.locator('[data-settings-form]');
        assert.equal(await settings.locator('input[name="soundEnabled"]').isChecked(),true);
        assert.equal(await settings.locator('input[name="musicEnabled"]').isChecked(),true);
        await settings.locator('input[name="soundEnabled"]').uncheck();
        await settings.locator('input[name="musicEnabled"]').check();
        await settings.locator('button[type="submit"]').click();
        await page.waitForFunction(()=>{
            const s=window.demianGameApplication.settings.snapshot();
            return !s.soundEnabled && s.musicEnabled;
        });
        await menu.locator('[data-shell-action="settings"]').click();
        assert.equal(await settings.locator('input[name="soundEnabled"]').isChecked(),false);
        assert.equal(await settings.locator('input[name="musicEnabled"]').isChecked(),true);
        await settings.locator('input[name="soundEnabled"]').check();
        await settings.locator('input[name="musicEnabled"]').uncheck();
        await settings.locator('button[type="submit"]').click();
        await page.waitForFunction(()=>{
            const s=window.demianGameApplication.settings.snapshot();
            return s.soundEnabled && !s.musicEnabled;
        });
        if(size.width===390){
            await page.evaluate(()=>window.demianGameApplication.launchGame('dino-run'));
            await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='playing');
            await page.evaluate(()=>window.demianGameApplication.pauseGame());
            await page.waitForFunction(()=>document.querySelector('[data-screen="pause"]')?.hidden===false);
            await page.locator('[data-screen="pause"] [data-shell-action="resume"]').click();
            await page.waitForFunction(()=>window.demianGameApplication.sessionState==='playing');
            await page.evaluate(()=>window.demianGameApplication.restartGame());
            await page.waitForFunction(()=>window.demianGameApplication.sessionState==='playing');
            await page.evaluate(()=>window.demianGameApplication.showMenu());
            await page.waitForFunction(()=>window.demianGameApplication.sessionState==='menu');
        }
        await page.evaluate(()=>window.demianGameApplication.shell.showResults({
            gameId:'dino-run',title:'نتیجه آزمون',failed:true,score:12,
            ranking:Promise.resolve({status:'practice'}),
        }));
        await page.waitForFunction(()=>document.querySelector('[data-results-record-note]')?.textContent?.includes('تمرینی'));
        assert.match(await page.locator('[data-results-reward-note]').innerText(),/جوایز/);
        await page.evaluate(()=>window.demianGameApplication.shell.showResults({
            gameId:'dino-run',title:'نتیجه آزمون',score:12,
            ranking:Promise.resolve({status:'verified'}),
        }));
        await page.waitForFunction(()=>document.querySelector('[data-results-record-note]')?.textContent?.includes('سرور'));
        assert.match(await page.locator('[data-results-reward-note]').innerText(),/کوپن نیست/);
        await page.screenshot({path:resolve(out,`phase07-${size.width}-results.png`),animations:'disabled'});
        await page.context().setOffline(true);
        await page.waitForFunction(()=>document.querySelector('[data-shell-network-status]')?.hidden===false);
        assert.match(await page.locator('[data-shell-network-status]').innerText(),/آفلاین/);
        await page.context().setOffline(false);
        await page.waitForFunction(()=>document.querySelector('[data-shell-network-status]')?.hidden===true);
        assert.deepEqual(errors,[]);
        report.profiles.push({width:size.width,height:size.height,cards:7,
            modes:['practice','verified'],independentAudioControls:true,
            navigatorOfflineBanner:true,menuPauseRetry:size.width===390,
            errors});
        await context.close();
    }
    report.status='passed';report.machineVerified=true;
} catch(error){
    report.status='failed';report.error=error.stack??String(error);
    for(const context of browser?.contexts()??[])
        for(const page of context.pages())await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});
    throw error;
} finally {
    await writeFile(resolve(out,'phase07-ux-qa.json'),JSON.stringify(report,null,2)+'\n');
    await browser?.close(); await new Promise(done=>server.close(done));
}
