import assert from 'node:assert/strict';
import { createReadStream, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(import.meta.dirname, '../docs/lobby-layout'));
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
    scope:'Game lobby and selection actionability, responsive geometry and explicit PWA update.'};
let browser;
try {
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    browser = await chromium.launch({headless:true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const url = 'http://127.0.0.1:'+server.address().port;
    for (const [width,height,mobile] of [[320,480,true],[390,844,true],[844,390,true],[1366,768,false]]) {
        const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,
            serviceWorkers:'allow'});
        try {
            const page=await context.newPage();
            // Deterministically present a waiting worker on every device.
            // The active registration remains real; only the waiting worker's
            // activation message is recorded instead of reloading the test.
            await page.addInitScript(() => {
                window.__qaUpdateMessages=[];
                const waiting={postMessage:message=>window.__qaUpdateMessages.push(message)};
                Object.defineProperty(ServiceWorkerRegistration.prototype,'waiting',{
                    configurable:true,get:()=>waiting
                });
            });
            await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
            await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',null,{timeout:35000});
            const update=page.locator('[data-pwa-update-host] .demian-pwa-update');
            await update.waitFor({state:'attached',timeout:30000});
            assert.equal(await page.locator('body > .demian-pwa-update').count(),0);
            assert.equal(await update.isVisible(),false);
            // Force the overlap regression to be exercised, not left to timing.
            await page.evaluate(() => {
                const app=window.demianGameApplication;
                app.shell.toast('Overlay regression check','error');
                app.eventBus.emit('character:warning',{message:'Overlay regression check'});
                const notice=document.querySelector('[data-shell-network-status]');
                if(notice){notice.hidden=false;notice.textContent='QA: passive network status';}
            });
            const passive=await page.locator('.shell-toast-host,.shell-toast,.arcade-toast,.shell-network-status').evaluateAll(nodes=>
                nodes.map(node=>({name:node.className,pointer:getComputedStyle(node).pointerEvents})));
            assert.ok(passive.length>=2 && passive.every(x=>x.pointer==='none'),JSON.stringify(passive));
            // The menu and three real modal close controls must work with a
            // pending update and informational notifications in the DOM.
            for (const [action,id] of [['settings','settings'],['leaderboard','leaderboard'],['rewards','coupon-wallet']]) {
                await page.locator('[data-screen="cafe-menu"] [data-shell-action="'+action+'"]').click();
                const modal=page.locator('[data-screen="'+id+'"]');
                await modal.waitFor({state:'visible',timeout:10000});
                assert.equal(await update.isVisible(),false);
                await modal.locator('[data-shell-action="close-modal"]').click({timeout:10000});
                await modal.waitFor({state:'hidden',timeout:10000});
            }
            await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
            const screen=page.locator('[data-screen="game-selection"]');
            await screen.waitFor({state:'visible',timeout:30000});
            assert.equal(await screen.locator('.demian-offline-manager, [data-offline-download], [data-offline-remove]').count(),0);
            assert.doesNotMatch(await screen.innerText(), /بازی بدون اینترنت/);
            await update.waitFor({state:'visible',timeout:10000});
            assert.equal(await update.evaluate(node=>getComputedStyle(node).position),'static');
            await update.locator('button').click({trial:true,timeout:10000});
            const geometry=await screen.locator('.shell-page').evaluate(node=>{
                const grid=node.querySelector('[data-game-grid]');
                const featured=grid.querySelector('.demian-game--featured');
                const card=grid.querySelector('[data-game-card="open-world"]');
                return {height:node.clientHeight,scrollHeight:node.scrollHeight,
                    horizontalOverflow:node.scrollWidth>node.clientWidth+1,
                    featuredWidth:featured.getBoundingClientRect().width,
                    regularWidth:card.getBoundingClientRect().width};
            });
            assert.equal(geometry.horizontalOverflow,false);
            assert.ok(geometry.featuredWidth>geometry.regularWidth*1.9,JSON.stringify(geometry));
            assert.ok(geometry.scrollHeight-geometry.height<260,JSON.stringify(geometry));
            if (height>=768) assert.ok(geometry.scrollHeight<=geometry.height+1,JSON.stringify(geometry));
            const games=[];
            for (const game of GAME_CATALOG.filter(g=>g.available)) {
                const action=screen.locator('[data-game-launch="'+game.id+'"]');
                assert.equal(await action.count(),1);
                // Playwright trial runs full scroll, visibility, stability and
                // hit testing, never force-clicks or dispatches fake DOM events.
                await action.click({trial:true,timeout:10000});
                assert.equal(await action.locator('img').evaluate(image=>image.decode().then(()=>image.naturalWidth>0)),true);
                games.push(game.id);
            }
            const guide=screen.locator('[data-game-design-guide="coffee-crash"] details');
            await guide.locator('summary').click({timeout:10000});
            assert.equal(await guide.evaluate(node=>node.open),true);
            await page.keyboard.press('Enter');
            assert.equal(await guide.evaluate(node=>node.open),false);
            await screen.locator('[data-shell-action="back-cafe"]').click({timeout:10000});
            await screen.waitFor({state:'hidden',timeout:10000});
            assert.equal(await page.evaluate(()=>window.__qaUpdateMessages.length),0);
            assert.equal(await update.isVisible(),false);
            await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
            await update.locator('button').click({timeout:10000});
            assert.deepEqual(await page.evaluate(()=>window.__qaUpdateMessages),[{type:'DEMIAN_ACTIVATE_UPDATE'}]);
            report.profiles.push({width,height,mobile,games,geometry,passive,offlinePanelAbsent:true,
                backActionable:true,modalCloseActionable:true,explicitUpdateMessage:true});
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
