/** Phase 8 PWA integrity test: mutate one release-checked atlas JSON and prove
 * no partial game is flagged ready; restore file, download, go offline, play.
 * Real service worker + Chromium, not a physical mobile device.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requestWorkerFromPage } from '../tests/js/helpers/PwaWorkerClient.js';

const root=resolve(import.meta.dirname,'../_site');
if(!existsSync(resolve(root,'offline-packs.json'))) throw Error('Build the static PWA first');
const output=resolve(import.meta.dirname,'../docs/phase08-mobile/qa');
mkdirSync(output,{recursive:true});
const prefix='/relocated/demian/';
const manifest=JSON.parse(await (await import('node:fs/promises')).readFile(resolve(root,'offline-packs.json'),'utf8'));
const target=manifest.core.find(x=>x.sha256 && /assets\/characters\/.*-atlas-.*-lite\.json$/.test(x.path));
assert.ok(target,'release did not contain a small hashed atlas manifest');
let sabotage=false;
let corruptResponses=0;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
    '.webp':'image/webp','.png':'image/png','.woff2':'font/woff2',
    '.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
    try{
        const uri=new URL(req.url,'http://localhost');
        const p=decodeURIComponent(uri.pathname);
        if (!p.startsWith(prefix)||p.includes('\\')||p.split('/').includes('..'))throw Error('Outside scope');
        const rel=p.slice(prefix.length)||'index.html';
        const file=resolve(root,rel);
        if(!file.startsWith(root+sep)||!statSync(file).isFile())throw Error('missing file');
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
        res.setHeader('Cache-Control',/service-worker|\.html$|\.webmanifest$|offline-packs\.json$/.test(rel)
            ? 'no-store':'public, max-age=3600');
        if(sabotage && rel===target.path){
            corruptResponses++;
            res.end('{"phase8":"intentionally corrupted"}');
            return;
        }
        createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch{res.writeHead(404);res.end('Not found');}
});
const report={phase:8,status:'pending',physicalDeviceVerified:false,
    scenario:'integrity mismatch -> no ready marker -> successful retry -> offline practice',
    corruptTarget:target.path,expectedSha256:target.sha256,release:manifest.release,
    warnings:['Headless Chromium is not an Android or iOS physical device.']};
let browser;
try{
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const {chromium}=await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href:'playwright');
    browser=await chromium.launch({headless:true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const context=await browser.newContext({viewport:{width:390,height:844},
        isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const page=await context.newPage();
    page.setDefaultTimeout(60000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const base='http://127.0.0.1:'+server.address().port+prefix;
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu');
    await page.waitForFunction(()=>navigator.serviceWorker?.controller!==null);
    sabotage=true;
    await assert.rejects(requestWorkerFromPage(page,'DEMIAN_PACK_DOWNLOAD','dino-run'), /integrity|mismatch/i);
    sabotage=false;
    assert.ok(corruptResponses>0,'actual corrupted resource was never requested');
    const afterBad=await page.evaluate(async()=>{
        const keys=await caches.keys();
        return {keys,coreReady:keys.some(k=>k.startsWith('demian-core-v1-'))};
    });
    assert.equal(afterBad.coreReady,false,'incomplete core must be deleted, never marked ready');
    assert.equal((await requestWorkerFromPage(page,'DEMIAN_PACK_STATUS')).games['dino-run'],false);
    report.corruptResponses=corruptResponses;
    report.corruptCoreDeleted=true;
    assert.equal((await requestWorkerFromPage(page,'DEMIAN_PACK_DOWNLOAD','dino-run')).games['dino-run'],true);
    const afterGood=await page.evaluate(async()=>{
        const keys=await caches.keys();
        return {keys,coreReady:keys.some(k=>k.startsWith('demian-core-v1-')),
            gameReady:keys.some(k=>k.startsWith('demian-game-v1-'))};
    });
    assert.equal(afterGood.coreReady,true);
    assert.equal(afterGood.gameReady,true);
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',
        null,{timeout:90000});
    await page.evaluate(()=>window.demianGameApplication.launchGame('dino-run',{seed:127}));
    await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='playing',
        null,{timeout:60000});
    await page.evaluate(()=>window.demianGameApplication.showMenu());
    await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu');
    report.offlinePracticeAfterIntegrityRetry=true;
    assert.deepEqual(errors,[]);
    report.status='passed';
    report.browser=browser.version();
    await context.close();
}catch(error){
    report.status='failed';
    report.error=error.stack??String(error);
    throw error;
}finally{
    writeFileSync(resolve(output,'phase08-pwa-integrity-recovery.json'),JSON.stringify(report,null,2)+'\n');
    await browser?.close();
    if(server.listening)await new Promise(done=>server.close(done));
}
