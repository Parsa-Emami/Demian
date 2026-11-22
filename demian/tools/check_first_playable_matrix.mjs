import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const candidate = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase6-step30/first-playable-matrix.json');
const baseline = process.env.DEMIAN_FIRST_FRAME_BASELINE;
const games = GAME_CATALOG.map(game => game.id);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
    '.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml',
    '.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const report = {schema:1, status:'pending', physicalPhoneVerified:false, ranked:false,
    network:{latencyMs:80, downMbps:8, cpuSlowdown:2}, sampleCountPerGamePerBuild:1,
    meaning:'After launch resolution, overlay hidden and Canvas presented inside successful runtime callback; not hardware scanout.',
    cache:'Fresh browser context independently per game; warm is same-session re-entry, not reload.',
    baseline:[], candidate:[], errors:[]};

function serve(root) {
    return createServer((req,res) => {
        try {
            const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
            if (path.includes('\\') || path.split('/').includes('..')) throw Error('path');
            const file = resolve(root,path.replace(/^\/+/,'') || 'index.html');
            if (!file.startsWith(root+sep) || !statSync(file).isFile()) throw Error('missing');
            res.setHeader('Content-Type',mime[extname(file)] ?? 'application/octet-stream');
            res.setHeader('Content-Security-Policy',"connect-src 'self'");
            if (file.endsWith('index.html')) {
                res.end(readFileSync(file,'utf8')
                    .replace(/(<meta name="demian-arcade-api" content=")[^"]*"/,'$1"')
                    .replace(/(<meta name="demian-ops-client" content=")[^"]*"/,'$1off"'));
            } else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
        } catch { res.writeHead(404); res.end(); }
    });
}

async function measure(browser, root, label, target) {
    const server = serve(root);
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const origin = 'http://127.0.0.1:'+server.address().port;
    try {
        for (const game of games) {
            const context = await browser.newContext({viewport:{width:390,height:844},
                isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
            try {
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror',error=>errors.push(error.message));
                const cdp = await context.newCDPSession(page);
                await cdp.send('Network.enable');
                await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,
                    downloadThroughput:8*1024*1024/8,uploadThroughput:2*1024*1024/8});
                await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});
                await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
                await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',null,{timeout:15000});
                await page.evaluate(()=>{
                    const app=window.demianGameApplication;
                    if (app.leaderboards.connected) throw Error('Ranked API not disabled');
                    let attempt=null, presented=0, sequence=0;
                    const present=app.rendererService.present.bind(app.rendererService);
                    app.rendererService.present=(...args)=>{
                        const result=present(...args);
                        if (result===true) presented++;
                        return result;
                    };
                    const launch=app.launchGame.bind(app);
                    app.launchGame=(id,...args)=>{
                        const current=attempt={id,sequence:++sequence,start:performance.now(),done:false};
                        window.__firstFrameMatrix=null;
                        return launch(id,...args).then(value=>{
                            current.done=true; current.presented=presented; return value;
                        });
                    };
                    const observe=app.runtime.observeRender;
                    app.runtime.observeRender=timestamp=>{
                        observe?.(timestamp);
                        if (!attempt?.done || window.__firstFrameMatrix || presented<=attempt.presented
                            || app.activeGameId!==attempt.id || app.runtime.currentGame!==app.activeGame
                            || app.sessionState!=='playing' || !app.shell.loadingScreen.element.hidden) return;
                        window.__firstFrameMatrix={game:attempt.id,sequence:attempt.sequence,
                            durationMs:Math.round((timestamp-attempt.start)*10)/10};
                    };
                });
                const timings={game};
                for (const mode of ['cold','warm']) {
                    await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').tap();
                    await page.locator('[data-game-card="'+game+'"] [data-game-launch]').tap();
                    await page.waitForFunction(({game,next})=>window.__firstFrameMatrix?.game===game
                        && window.__firstFrameMatrix.sequence===next,{game,next:mode==='cold'?1:2},{timeout:15000});
                    const data=await page.evaluate(()=>({
                        measured:window.__firstFrameMatrix.durationMs,
                        appMetric:window.demianGameApplication.firstPlayableFrame?.last?.durationMs??null,
                        canvasVisible:!!window.demianGameApplication.rendererService.canvas.getClientRects().length
                    }));
                    assert.ok(Number.isFinite(data.measured) && data.measured>=0 && data.canvasVisible,label+' '+game+' '+mode);
                    if (label==='candidate') {
                        assert.ok(data.measured<(mode==='cold'?7000:3000),label+' '+game+' '+mode+' '+data.measured);
                        assert.ok(Number.isFinite(data.appMetric) && Math.abs(data.appMetric-data.measured)<100,
                            'Independent Canvas evidence disagrees with application tracker');
                    }
                    timings[mode+'Ms']=data.measured;
                    timings[mode+'TargetMet']=data.measured<(mode==='warm'?1000:game==='open-world'?3000:2000);
                    await page.evaluate(()=>window.demianGameApplication.showMenu());
                    await page.waitForFunction(()=>window.demianGameApplication.sessionState==='menu');
                }
                assert.deepEqual(errors,[],label+' '+game+' browser errors');
                target.push(timings);
            } finally { await context.close(); }
        }
    } finally { await new Promise(done=>server.close(done)); }
}
let browser;
try {
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    if (baseline) await measure(browser,resolve(baseline),'baseline',report.baseline);
    await measure(browser,candidate,'candidate',report.candidate);
    if (report.baseline.length) {
        report.comparison=report.candidate.map(row=>{
            const old=report.baseline.find(item=>item.game===row.game);
            return {game:row.game,coldDeltaMs:Math.round((row.coldMs-old.coldMs)*10)/10,
                warmDeltaMs:Math.round((row.warmMs-old.warmMs)*10)/10};
        });
    }
    report.status='passed';
} catch (error) { report.status='failed'; report.errors.push(String(error.stack??error)); process.exitCode=1; }
finally {
    await browser?.close();
    mkdirSync(resolve(output,'..'),{recursive:true});
    writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log('[First playable matrix]',JSON.stringify(report));
}
