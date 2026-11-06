import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root=resolve(import.meta.dirname,'..'),release=resolve(process.env.DEMIAN_QA_RELEASE_DIR??resolve(root,'_site'));
const output=resolve(root,'docs/validation/d01-d03-v2');
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.css':'text/css'};
const server=createServer(async(req,res)=>{
    try{
        let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(!path.startsWith('/Demian/'))throw Error('Unknown base');path=path.slice(7);if(path.endsWith('/'))path+='index.html';
        const file=resolve(release,`.${path}`);if(!file.startsWith(release+'/'))throw Error('Outside release');
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
});
await mkdir(output,{recursive:true});await new Promise(done=>server.listen(0,'127.0.0.1',done));
const {chromium}=await import(process.env.DEMIAN_PLAYWRIGHT_MODULE?pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-accelerated-2d-canvas','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const matrixOnly=process.argv.includes('--matrix-only'),catalogOnly=process.argv.includes('--catalog-only');
const report={browser:browser.version(),rendering:'headless Chromium / software Canvas2D and SwiftShader',physicalDevices:false,humanPlaytest:false,profiles:[]};
try{
    for(const profile of [{name:'desktop',width:1440,height:900,isMobile:false},{name:'phone',width:390,height:844,isMobile:true}]){
        if(matrixOnly&&profile.name==='phone')continue;
        const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.isMobile,hasTouch:profile.isMobile,deviceScaleFactor:1});
        const page=await context.newPage(),errors=[],failures=[];
        page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)failures.push(response.url());});
        page.on('console',message=>{if(message.text().startsWith('MATRIX'))console.log(message.text());});
        await page.goto(`http://127.0.0.1:${server.address().port}/Demian/`);
        await page.waitForFunction(()=>window.demianGameApplication?.sessionState==='menu',null,{timeout:60000});
        await page.locator('[data-shell-action="motion-comparison"]').click();
        await page.waitForFunction(()=>[...window.demianGameApplication.shell.motionScreen.cards.values()].every(card=>card.avatar));
        await page.evaluate(()=>{const screen=window.demianGameApplication.shell.motionScreen;screen.playing=false;screen.phase=.23;screen.render();});
        if(matrixOnly){
            const matrix=await page.evaluate(async()=>{
                const app=window.demianGameApplication,screen=app.shell.motionScreen,slugs=app.characterVisuals.rosterSlugs();
                const directions=['e','se','s','sw','w','nw','n','ne'];
                const states=['idle','breathe','blink','ready','walk','tiptoe','run','sprint','skid','dash','turn','takeoff','jump','hop','hover','fall','land','slide','crouch','dodge','wave','salute','celebrate','win','dance','guitar','guitar_loop','spin','laugh','pose','sleep','taunt'];
                for(const card of screen.cards.values()){const old=card.article.querySelector('canvas'),canvas=document.createElement('canvas');canvas.width=280;canvas.height=180;canvas.getContext('2d',{willReadFrequently:true}).scale(.5,.5);old.replaceWith(canvas);}
                const probe=document.createElement('canvas');probe.width=64;probe.height=70;const ctx=probe.getContext('2d',{willReadFrequently:true}),rows=[];
                for(const variant of ['lite','runtime','detail'])for(let group=0;group<12;group+=4){
                    console.log('MATRIX',variant,group);
                    await Promise.all(slugs.slice(group,group+4).map(async(slug,index)=>{await screen.loadCard(index,slug);screen.cards.get(index).avatar=await app.characterVisuals.createCanvasAvatar(slug,{variant});}));
                    for(const state of states)for(const direction of directions){
                        screen.state=state;screen.direction=direction;screen.facing=direction.includes('w')?-1:1;screen.phase=.23;screen.render(0);
                        for(const card of screen.cards.values()){
                            const skin=card.avatar.atlas.masterSkin;
                            if(skin?.slug!==card.slug||skin.variant!==variant||!skin.views[direction]?.head)throw Error(`Wrong skin ${card.slug}/${variant}/${direction}`);
                            if(!Object.values(card.controller.pose.joints).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error('Nonfinite pose');
                            ctx.clearRect(0,0,64,70);ctx.drawImage(card.article.querySelector('canvas'),0,0,140,180,0,0,64,70);
                            const pixels=ctx.getImageData(0,0,64,70).data;let hash=2166136261,foreground=0;
                            for(let i=0;i<pixels.length;i+=4){if(Math.abs(pixels[i]-17)+Math.abs(pixels[i+1]-30)+Math.abs(pixels[i+2]-27)>35)foreground++;hash=Math.imul(hash^pixels[i],16777619);hash=Math.imul(hash^pixels[i+1],16777619);hash=Math.imul(hash^pixels[i+2],16777619);}
                            if(foreground<140)throw Error(`Empty art ${card.slug}/${state}/${direction}/${variant}`);
                            rows.push({slug:card.slug,state,direction,quality:variant,phase:.23,signature:(hash>>>0).toString(16),foregroundPixels:foreground,status:'passed'});
                        }
                    }
                }
                return {renderSurface:{width:280,height:180,scale:.5,backend:'software Canvas2D'},dimensions:{characters:12,states:32,directions:8,qualities:3},cases:rows.length,rows};
            });
            assert.equal(matrix.cases,9216);await writeFile(resolve(output,'character-matrix.json'),JSON.stringify(matrix,null,2)+'\n');report.matrix={...matrix.dimensions,cases:matrix.cases};
            assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);await context.close();continue;
        }
        await page.screenshot({path:resolve(output,`samples-${profile.name}.png`)});
        if(catalogOnly){
            const data=await page.evaluate(async()=>{
                const app=window.demianGameApplication,screen=app.shell.motionScreen,slugs=app.characterVisuals.rosterSlugs();
                const canvas=document.createElement('canvas');canvas.width=1120;canvas.height=1080;const ctx=canvas.getContext('2d');ctx.fillStyle='#14251e';ctx.fillRect(0,0,1120,1080);
                for(let group=0;group<3;group++){
                    await Promise.all(slugs.slice(group*4,group*4+4).map((slug,index)=>screen.loadCard(index,slug)));
                    screen.state='run';screen.direction='e';screen.facing=1;screen.phase=.23;screen.render();
                    for(const[index,card]of screen.cards){ctx.drawImage(card.article.querySelector('canvas'),0,0,280,360,index*280,group*360,280,360);ctx.fillStyle='#ead8b5';ctx.font='16px sans-serif';ctx.fillText(card.slug,index*280+16,group*360+30);}
                }return canvas.toDataURL('image/png').split(',')[1];
            });
            await writeFile(resolve(output,`catalog-${profile.name}.png`),Buffer.from(data,'base64'));await context.close();continue;
        }
        await page.evaluate(async()=>{const s=window.demianGameApplication.shell.motionScreen;await Promise.all(['uzudi','amirreza','darya','tiam'].map((slug,index)=>s.loadCard(index,slug)));s.state='run';s.direction='s';s.facing=1;s.phase=.31;s.render(.1);});
        await page.screenshot({path:resolve(output,`accessories-${profile.name}.png`)});await page.keyboard.press('Escape');
        await page.evaluate(()=>window.demianGameApplication.launchGame('open-world'));
        const cafe=[];
        for(const quality of ['performance','balanced','high']){
            await page.evaluate(quality=>{const a=window.demianGameApplication;a.settings.update({quality});const g=a.activeGame;g.characterManager.setPosition(g.manifest.spawn);g.focusCharacter({close:true});},quality);
            await page.waitForFunction(expected=>window.demianGameApplication.characterManager.activeEntity.atlas.masterSkin?.variant===expected,{performance:'lite',balanced:'runtime',high:'detail'}[quality]);
            await page.waitForFunction(()=>window.demianGameApplication.activeGame.pixelRenderer.cafe.stream.stats().ready>0);
            await page.screenshot({path:resolve(output,`cafe-${profile.name}-${quality}.png`)});
            const state=await page.evaluate(()=>{const g=window.demianGameApplication.activeGame;return {colliders:g.staticColliders.length,skin:g.characterManager.activeEntity.atlas.masterSkin.variant,stream:g.pixelRenderer.cafe.stream.stats()};});
            assert.equal(state.colliders,321);cafe.push({quality,...state});
        }
        console.log(`${profile.name}: cafe passed`);
        await page.evaluate(()=>window.demianGameApplication.launchGame('dino-run'));
        await page.waitForFunction(()=>window.demianGameApplication.activeGame?.model?.status==='ready');
        assert.equal(await page.locator('[data-run-difficulty]').count(),0);
        await page.locator('.runner-ready button').click();await page.waitForFunction(()=>window.demianGameApplication.activeGame.model.status==='running');
        await page.evaluate(()=>{const a=window.demianGameApplication,g=a.activeGame;a.runtime.stop();g.finished=false;g.model.reset({seed:8123,width:g.model.width});});
        const attackChecks=[];
        for(const target of ['uzudi-warning','uzudi-fire','amirreza-warning','amirreza-fire']){
            const result=await page.evaluate(target=>{
                const app=window.demianGameApplication,g=app.activeGame,slug=target.split('-')[0],firing=target.endsWith('fire');
                for(let i=0;i<6000;i++){
                    const m=g.model,next=m.obstacles.find(o=>o.x+o.w>72),near=next&&next.x-86<m.speed*.31;
                    g.fixedUpdate(1/60,{jump:m.status==='ready'||Boolean(near&&next.type==='cactus'&&m.y===0),jumpHeld:true,duck:Boolean(near&&next.type==='bird')});
                    if(m.status==='over')throw Error('Autoplay collided before attack capture');
                    const attack=m.obstacles.find(o=>o.attacker===slug&&(firing?o.warningLeft===0&&o.age>1.12&&o.age<1.6:o.warningLeft>.4&&o.age>.25));
                    if(attack){g.update(.1);g.render(1);return {slug,phase:firing?'fire':'warning',time:m.time,skin:g.raiders.get(slug)?.atlas.masterSkin.slug,warningLeft:attack.warningLeft,level:m.difficulty.level,status:m.status};}
                }throw Error('Attack did not occur');
            },target);
            assert.equal(result.skin,target.split('-')[0]);assert(result.level>=8.4);attackChecks.push(result);
            await page.screenshot({path:resolve(output,`${target}-${profile.name}.png`)});
        }
        const runner=[];
        for(const quality of ['performance','balanced','high']){
            await page.evaluate(quality=>window.demianGameApplication.settings.update({quality}),quality);
            await page.waitForFunction(expected=>window.demianGameApplication.activeGame.avatar.atlas.masterSkin?.variant===expected,{performance:'lite',balanced:'runtime',high:'detail'}[quality]);
            const state=await page.evaluate(()=>{const g=window.demianGameApplication.activeGame;g.render(1);return {quality:g.environment.tier,layers:g.environment.art?.layers.length,decodedBytes:g.environment.art?.decodedBytes,raiders:[...g.raiders.keys()]};});
            assert.equal(state.layers,3);assert(state.decodedBytes<=12*1024*1024);assert.equal(state.raiders.length,2);runner.push(state);
            await page.screenshot({path:resolve(output,`runner-${profile.name}-${quality}.png`)});
        }
        const reduced=await page.evaluate(()=>{
            const a=window.demianGameApplication,g=a.activeGame;a.settings.update({motion:'reduced'});
            const canvas=document.createElement('canvas');canvas.width=g.width;canvas.height=g.height;const ctx=canvas.getContext('2d');
            let calls=[];const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{calls.push(args.slice(1));draw(...args);};
            const input={width:g.width,height:g.height,ground:g.ground,scale:g.scale,distance:300,time:8};g.environment.draw(ctx,input);const first=JSON.stringify(calls);calls=[];g.environment.draw(ctx,{...input,distance:700});
            return {enabled:g.environment.reducedMotion,parallaxFrozen:first===JSON.stringify(calls),overflow:document.documentElement.scrollWidth>innerWidth+1,runtimeErrors:[...a.runtime.errorCounts.entries()]};
        });
        assert.equal(reduced.enabled,true);assert.equal(reduced.parallaxFrozen,true);assert.equal(reduced.overflow,false);assert.deepEqual(reduced.runtimeErrors,[]);
        assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);report.profiles.push({...profile,cafe,runner,attackChecks,reduced,errors,failures});
        await context.close();console.log(`${profile.name}: runner and attackers passed`);
    }
    report.status='passed';await writeFile(resolve(output,matrixOnly?'matrix-checks.json':catalogOnly?'catalog-checks.json':'viewport-checks.json'),JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
