import assert from 'node:assert/strict';
import { createReadStream, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/offline-manager-layout');
mkdirSync(output, {recursive:true});
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
    '.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png',
    '.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server = createServer((req,res) => {
    try {
        const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw Error('path');
        const file = resolve(root,path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root+sep) || !statSync(file).isFile()) throw Error('not found');
        res.setHeader('Content-Type',mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end(); }
});
const report = {status:'pending', physicalDeviceVerified:false, profiles:[], errors:[],
    scope:'Real Playwright actionability and geometry; download integrity and gameplay remain separate required CI gates.'};
let browser;
try {
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const url = 'http://127.0.0.1:'+server.address().port;
    for (const [width,height,mobile] of [[320,568,true],[390,844,true],[844,390,true],[1366,768,false]]) {
        const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,
            serviceWorkers:'allow'});
        try {
            const page=await context.newPage();
            await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
            await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',null,{timeout:35000});
            await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
            const screen=page.locator('[data-screen="game-selection"]');
            const panel=screen.locator('.shell-page > .demian-offline-manager');
            await panel.waitFor({state:'visible',timeout:30000});
            assert.equal(await screen.locator(':scope > .demian-offline-manager').count(),0);
            assert.equal(await panel.count(),1);
            const geometry=await panel.evaluate(node=>{
                const grid=node.parentElement.querySelector('.game-grid');
                const p=node.getBoundingClientRect(),g=grid.getBoundingClientRect();
                return {panelTop:p.top,gridBottom:g.bottom,position:getComputedStyle(node).position,
                    width:p.width,gridWidth:g.width};
            });
            assert.equal(geometry.position,'static');
            assert.ok(geometry.panelTop>=geometry.gridBottom-1,JSON.stringify(geometry));
            const games=[];
            for (const game of GAME_CATALOG.filter(g=>g.available)) {
                const action=screen.locator('[data-game-launch="'+game.id+'"]');
                assert.equal(await action.count(),1);
                // Playwright trial runs full scroll, visibility, stability and
                // hit testing, never force-clicks or dispatches fake DOM events.
                await action.click({trial:true,timeout:10000});
                games.push(game.id);
            }
            const download=panel.locator('[data-offline-download="dino-run"]');
            await download.click({trial:true,timeout:10000});
            await screen.locator('[data-shell-action="back-cafe"]').click({timeout:10000});
            await screen.waitFor({state:'hidden',timeout:10000});
            report.profiles.push({width,height,mobile,games,geometry,downloadActionable:true,backActionable:true});
        } finally { await context.close(); }
    }
    report.status='passed';
} catch(error) {
    report.status='failed';report.errors.push(String(error.stack??error));throw error;
} finally {
    await browser?.close();
    await new Promise(done=>server.close(done));
    writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
}
