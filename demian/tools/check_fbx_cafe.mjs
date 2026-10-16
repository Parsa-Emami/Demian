/** Real browser smoke test for the exported game, source map and on-demand model. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const site=resolve(process.env.DEMIAN_SITE_ROOT??resolve(root,'_site'));
const output=resolve(process.env.DEMIAN_FBX_QA_DIR??resolve(root,'docs/fbx-cafe'));
const {chromium}=await import(process.env.DEMIAN_PLAYWRIGHT_MODULE?pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href:'playwright');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
    try {
        let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        // Exercise deployment below a repository prefix, exactly like GitHub Pages.
        if(!path.startsWith('/Demian/'))throw new Error('Unknown base');
        path=path.slice('/Demian'.length);if(path.endsWith('/'))path+='index.html';
        const file=resolve(site,`.${path}`);if(!file.startsWith(site+'/'))throw new Error('Outside site');
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
});
await mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={browser:browser.version(),cases:[],physicalDeviceTest:false};
try {
    for(const scenario of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844,mobile:true},
        {name:'model-unavailable',width:1000,height:800,modelFailure:true},
        {name:'floorplan-unavailable',width:1000,height:800,artFailure:true}].filter((s)=>!process.env.DEMIAN_QA_CASE || s.name===process.env.DEMIAN_QA_CASE)) {
        const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},
            hasTouch:!!scenario.mobile,isMobile:!!scenario.mobile,deviceScaleFactor:1});
        console.log('CASE',scenario.name);
        const requests=[],errors=[];const page=await context.newPage();
        page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
        if(scenario.modelFailure)await page.route('**/cafe.glb.gz?*',r=>r.fulfill({status:503,body:'test unavailable'}));
        if(scenario.artFailure)await page.route('**/floorplan.webp?*',r=>r.fulfill({status:503,body:'test unavailable'}));
        await page.goto(`http://127.0.0.1:${server.address().port}/Demian/`);
        await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',null,{timeout:60000});
        await page.evaluate(()=>window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(()=>window.demianGameApplication.activeGame?.characterManager?.activeEntity,null,{timeout:60000});
        assert.equal(requests.some(u=>u.includes('.glb.gz')),false,'The large model must not block game startup.');
        const state=await page.evaluate(()=>{
            const g=window.demianGameApplication.activeGame;
            return{version:g.manifest.version,bounds:g.manifest.bounds,position:g.characterManager.position(),colliders:g.staticColliders.length,
                renderer:g.context.container.dataset.rendererBackend,cache:g.pixelRenderer.sceneCache.stats()};
        });
        assert.equal(state.version,5);assert.equal(state.colliders,321);assert.equal(state.renderer,'pixel-2d');
        assert.ok(Math.abs(state.position.z+4.68)<1);
        await page.screenshot({path:resolve(output,`${scenario.name}-game.png`)});
        if(!scenario.artFailure){
            // Follow a real navigation route, then return through fast travel.
            await page.evaluate(async()=>{const g=window.demianGameApplication.activeGame;
                const point=g.manifest.savePoint('save-restroom');g.discovery.unlockSavePoint(point.id);await g.fastTravel(point);
            });
            const traveled=await page.evaluate(()=>window.demianGameApplication.activeGame.characterManager.position());
            assert.ok(Math.abs(traveled.z+119.16)<1);
            await page.evaluate(()=>window.demianGameApplication.activeGame.hud.openMap());
            await page.locator('[data-map-3d]').waitFor({state:'visible'});
            await page.locator('[data-map-zoom-in]').click();
            assert.ok(await page.evaluate(()=>window.demianGameApplication.activeGame.hud.worldMap.mapZoom>1));
            await page.locator('[data-map-fit]').click();
            assert.equal(await page.evaluate(()=>window.demianGameApplication.activeGame.hud.worldMap.mapZoom),1);
            await page.screenshot({path:resolve(output,`${scenario.name}-map.png`)});
            await page.locator('[data-map-3d]').click();
            if(scenario.modelFailure){
                await page.locator('[data-model-error="true"]').waitFor({timeout:60000});
            }else{
                await page.locator('[data-model-ready="true"]').waitFor({timeout:120000});
                await page.screenshot({path:resolve(output,`${scenario.name}-model.png`)});
                const canvas=page.locator('.fbx-cafe-inspector canvas');const rect=await canvas.boundingBox();
                await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.down();
                await page.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.52,{steps:6});await page.mouse.up();
                await page.locator('[data-fbx-roof]').click();assert.equal(await page.locator('[data-fbx-roof]').getAttribute('aria-pressed'),'true');
                await page.locator('[data-fbx-reset]').click();
            }
            console.log('CLOSE MODEL',scenario.name);
            await page.locator('[data-fbx-close]').click({timeout:120000});assert.equal(await page.locator('.fbx-cafe-inspector').count(),0);
            await page.locator('[data-map-close]').click();
        }
        assert.deepEqual(errors,[]);report.cases.push({name:scenario.name,passed:true,state,modelDownloaded:requests.some(u=>u.includes('.glb.gz'))});
        await context.close();
    }
    await writeFile(resolve(output,'browser-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
