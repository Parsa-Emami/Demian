import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { characterReferenceBodyHeightRatio } from '../resources/js/game/characters/CharacterVisualContract.js';

const character = process.argv[2] ?? 'arsal';
assert.ok(['arsal', 'darya'].includes(character));
const project = resolve(import.meta.dirname, '..');
const playable = resolve(process.env.DEMIAN_QA_SITE ?? resolve(project, '../playable'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/dcs-v15'));
const screenshots = resolve(process.env.DEMIAN_QA_SCREENSHOT_DIR ?? resolve(tmpdir(), 'demian-' + character + '-v15'));
const { chromium, webkit, devices } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const engine = process.env.DEMIAN_QA_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };
await mkdir(out, { recursive:true });
await mkdir(screenshots, { recursive:true });
const server = createServer(async (request, response) => {
    try {
        let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = resolve(playable, `.${path}`);
        if (!file.startsWith(`${playable}/`)) throw new Error('Outside export');
        const bytes = await readFile(file);
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless:true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args:process.env.DEMIAN_BROWSER_ARGS ? JSON.parse(process.env.DEMIAN_BROWSER_ARGS)
        : engine === 'chromium' ? ['--no-sandbox','--disable-gpu'] : [] });
const report = { character, engine, browser:browser.version(), physicalPhoneMeasured:false, viewports:[], status:'running' };
async function visibleBodyScale(page, mode) {
    const meta = await page.evaluate(mode => {
        const app = window.demianGameApplication;
        return (mode === 'runner' ? app.activeGame.avatar : app.characterManager.activeEntity).atlas.meta;
    }, mode);
    const runnerRatio = characterReferenceBodyHeightRatio({ meta }, { sideView: true });
    return page.evaluate(({ mode, runnerRatio }) => {
        const app = window.demianGameApplication;
        const entity = mode === 'runner' ? app.activeGame.avatar : app.characterManager.activeEntity;
        const atlas = entity.atlas, image = entity.texture.image;
        const referenceRatio = mode === 'runner' ? runnerRatio : atlas.display.worldHeight / entity.baseHeight;
        const clips = entity.animator.animations;
        const cell = atlas.meta.frameSize.w;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = cell;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        function height(name) {
            const f=atlas.frames[name]; ctx.clearRect(0,0,cell,cell);
            ctx.drawImage(image,f.x,f.y,f.w,f.h,0,0,cell,cell);
            const pixels=ctx.getImageData(0,0,cell,cell).data;
            let top=cell,bottom=-1;
            for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)if(pixels[(y*cell+x)*4+3]>32){top=Math.min(top,y);bottom=Math.max(bottom,y);}
            return (bottom-top+1)/cell;
        }
        const ratios = {};
        for(const state of ['idle','walk','run','sprint']) {
            const heights=clips[state].frames.map(height).sort((a,b)=>a-b);
            const n=heights.length;
            ratios[state]=(heights[Math.floor((n-1)/2)]+heights[Math.floor(n/2)])/2/referenceRatio;
        }
        return {ratios,jumpRecoveryRatio:height(clips.land.frames.at(-1))/referenceRatio,
            airborneRatio:clips.jump.frames.map(height).sort((a,b)=>a-b)[Math.floor(clips.jump.frames.length/2)]/referenceRatio,
            frameWorldHeight:entity.baseHeight??null,
            currentWorldHeight:mode==='world'?height(entity.animator.currentFrameName())*entity.baseHeight:null,
            bodyScale:entity.bodyRoot?.scale?.y??1,variant:atlas.meta.variant};
    }, { mode, runnerRatio });
}

async function inspectDaryaMotion(page) {
    const result = await page.evaluate(() => {
        const game = window.demianGameApplication.activeGame;
        const manager = game.characterManager;
        const actor = manager.activeEntity;
        const grid = game.navigationGrid;
        const origin = { x: actor.group.position.x, z: actor.group.position.z };
        const basis = game.cameraController.movementBasis();
        const dt = 1 / 60;
        const at = (point, x, z, distance) => ({ x: point.x + x * distance, z: point.z + z * distance });
        function line(start, end) {
            const cell = grid.worldToCell(end, { clamp: false });
            return grid.inBounds(cell.x, cell.z) && grid.lineWalkable(start, end);
        }
        function lane(x, z, length, reverse = false) {
            for (let row = 2; row < grid.height - 2; row += 2) {
                for (let col = 2; col < grid.width - 2; col += 2) {
                    const point = grid.cellToWorld({ x: col, z: row });
                    if (line(point, at(point, x, z, length)) && (!reverse || line(point, at(point, x, z, -3)))) return point;
                }
            }
            throw new Error('Cafe test lane is unavailable');
        }
        function startAt(point) {
            manager.setPosition(point);
            actor.velocity.set(0, 0, 0);
            actor.introActive = false;
            actor.stateLock = 0;
        }
        function command(x, z, magnitude, run) {
            return { x: (basis.right.x * x + basis.right.z * z) * magnitude,
                z: -(basis.forward.x * x + basis.forward.z * z) * magnitude, run };
        }
        const directions = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
        const modes = { walk: [.8, false, 12, 4.5], run: [.84, true, 16, 6.5], sprint: [1, true, 16, 7.5] };
        const clips = {};
        const observedGaits = {};
        let companionStep = 0;
        let usefulFrames = 0;
        for (const [state, [strength, run, count, length]] of Object.entries(modes)) {
            clips[state] = {};
            for (const [index, direction] of directions.entries()) {
                const x = Math.cos(index * Math.PI / 4), z = Math.sin(index * Math.PI / 4);
                startAt(lane(x, z, length));
                const input = command(x, z, strength, run);
                const seen = new Set();
                const observed = new Set();
                for (let tick = 0; tick < 100 && seen.size < count; tick++) {
                    const previous = actor.companion.sample().world;
                    game.fixedUpdate(dt, input);
                    const current = actor.companion.sample();
                    observed.add(`${actor.state}/${actor.direction}`);
                    companionStep = Math.max(companionStep, Math.hypot(current.world.x - previous.x, current.world.z - previous.z));
                    if (actor.state === state && actor.direction === direction) seen.add(actor.animator.currentFrameName());
                    if (actor.state === state && ['walk', 'run'].includes(actor.companion.state)) usefulFrames++;
                }
                clips[state][direction] = [...seen];
                observedGaits[`${state}/${direction}`] = [...observed];
            }
        }
        startAt(lane(1, 0, 5, true));
        for (let tick = 0; tick < 25; tick++) game.fixedUpdate(dt, command(1, 0, .84, true));
        const turn = [actor.direction];
        let discontinuity = 0;
        let lastPhase = actor.animator.locomotionPhase;
        for (let tick = 0; tick < 24; tick++) {
            game.fixedUpdate(dt, command(-1, 0, .84, true));
            if (actor.direction !== turn.at(-1)) turn.push(actor.direction);
            const phase = actor.animator.locomotionPhase;
            discontinuity = Math.max(discontinuity, (phase - lastPhase + 8) % 8);
            lastPhase = phase;
        }
        startAt(origin);
        return { clips, turn, discontinuity, companionStep, usefulFrames, observedGaits };
    });
    for (const [state, directions] of Object.entries(result.clips)) {
        for (const [direction, names] of Object.entries(directions)) {
            assert.equal(names.length, state === 'walk' ? 12 : 16,
                `${state}/${direction} observed ${result.observedGaits[`${state}/${direction}`].join(', ')}`);
            assert.ok(names.every(name => name.startsWith(`world_${direction}_${state === 'sprint' ? 'run' : state}-`)));
            directions[direction] = names.length;
        }
    }
    const circular = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
    assert.equal(result.turn[0], 'e');
    assert.equal(result.turn.at(-1), 'w');
    assert.equal(result.turn.length, 5);
    for (let i = 1; i < result.turn.length; i++) {
        const angle = Math.abs(circular.indexOf(result.turn[i]) - circular.indexOf(result.turn[i - 1]));
        assert.ok(angle === 1 || angle === 7);
    }
    assert.ok(result.discontinuity <= .05, `Stride phase jumped by ${result.discontinuity}`);
    assert.ok(result.companionStep <= 13 / 60 + .0001);
    assert.ok(result.usefulFrames > 200);
    delete result.observedGaits;
    return result;
}

try {
    for (const [width, height] of (engine === 'webkit' ? [[390,844]] : [[390,844], [1440,900]])) {
        const mobile = width < 1024;
        const device = mobile ? devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7'] : null;
        const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile,
            ...(device ? { userAgent: device.userAgent } : {}) });
        const page = await context.newPage();
        const press = locator => mobile ? locator.tap() : locator.click();
        const errors = [], failures = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failures.push(new URL(response.url()).pathname); });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, {timeout:45000});
        const id = 'builtin-' + character;
        await press(page.locator('.menu-character-button'));
        await page.locator(`[data-character-card="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForFunction(expected => document.querySelector(`[data-character-card="${expected}"] [data-character-preview]`)?.dataset.previewState === 'ready', id);
        await press(page.locator(`[data-select-character="${id}"]`));
        await page.waitForFunction(slug => window.demianGameApplication.characterVisuals.activeSlug === slug, character);
        if (!mobile) await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'collapsed');
        await page.evaluate(() => window.demianGameApplication.launchGame('dino-run', {seed:127}));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.model?.status === 'ready');
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.avatar.slug), character);
        if (character === 'darya') await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.companion?.image.complete);
        const runnerBodyScale = await visibleBodyScale(page, 'runner');
        assert.ok(runnerBodyScale.jumpRecoveryRatio >= .96 && runnerBodyScale.jumpRecoveryRatio <= 1.05);
        assert.ok(runnerBodyScale.airborneRatio >= .75 && runnerBodyScale.airborneRatio <= 1.05);
        for(const [state, ratio] of Object.entries(runnerBodyScale.ratios)) {
            assert.ok(ratio >= .96 && ratio <= 1.05, `Runner ${state} visible height must match the canonical body: ${ratio}`);
        }
        await press(page.locator('.runner-ready:not(.runner-lesson) [data-input-press="jump"]'));
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'running');
        await page.evaluate(() => { const model = window.demianGameApplication.activeGame.model; model.spawnIn = 999; model.obstacles = []; });
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
        if (mobile) await page.locator('.runner-controls__jump').tap();
        else await page.keyboard.down('Space');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
        if (!mobile) await page.keyboard.up('Space');
        if (character === 'darya') await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.companion.elevation > 0);
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
        if (character === 'darya') await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.companion.hopTime === null);
        let touch;
        if (mobile && engine === 'chromium') {
            touch = await context.newCDPSession(page);
            const duck = page.locator('.runner-controls__duck');
            await duck.waitFor({state:'visible'});
            const box = await duck.boundingBox();
            assert.ok(box, 'The runner slide button must have a touch target');
            await touch.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
        } else await page.keyboard.down('ArrowDown');
        await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.state === 'slide');
        await page.evaluate(() => {
            window.demianGameApplication.activeGame.model.obstacles = [{id:1,type:'bird',x:104,previousX:104,y:46,w:40,h:22,scored:false}];
        });
        await page.waitForTimeout(180);
        assert.equal(await page.evaluate(() => window.demianGameApplication.activeGame.model.status), 'running');
        const pack = await page.evaluate(() => {
            const avatar = window.demianGameApplication.activeGame.avatar;
            return {variant:avatar.atlas.meta.variant, version:avatar.atlas.meta.version,
                actualRevision:new URL(avatar.texture.image.src).searchParams.get('sprite_rev'),
                expectedRevision:avatar.atlas.meta.imageRevision};
        });
        assert.equal(pack.actualRevision, pack.expectedRevision);
        assert.equal(pack.version, 15);
        assert.match(await page.evaluate(() => window.demianGameApplication.activeGame.avatar.animator.currentFrameName()), /^side_slide_e_/);
        await page.screenshot({path:resolve(screenshots, `${character}-slide-${width}.png`)});
        if (touch) await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        else await page.keyboard.up('ArrowDown');
        await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(() => window.demianGameApplication.activeGameId === 'open-world' && window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({close:true}));
        await page.waitForFunction(slug => { const e=window.demianGameApplication.characterManager.activeEntity; return e.character.slug === slug && e.grounded && e.stateLock<=0; }, character);
        let distance = 0;
        let walkScale, runScale;
        for (const key of ['d','a','w','s']) {
            const start = await page.evaluate(() => { const p=window.demianGameApplication.characterManager.activeEntity.group.position; return {x:p.x,z:p.z}; });
            await page.keyboard.down(key);
            await page.waitForTimeout(260);
            walkScale = await visibleBodyScale(page, 'world');
            await page.screenshot({path:resolve(screenshots, `${character}-walk-${width}.png`)});
            await page.keyboard.down('Shift');
            await page.waitForTimeout(300);
            runScale = await visibleBodyScale(page, 'world');
            await page.screenshot({path:resolve(screenshots, `${character}-run-${width}.png`)});
            distance = await page.evaluate(start => { const p=window.demianGameApplication.characterManager.activeEntity.group.position; return Math.hypot(p.x-start.x,p.z-start.z); }, start);
            await page.keyboard.up(key); await page.keyboard.up('Shift');
            if (distance > .03) break;
        }
        assert.ok(distance > .03, character + ' must move in the cafe');
        for(const scale of [walkScale,runScale]) {
            assert.ok(scale.currentWorldHeight >= 3.05 && scale.currentWorldHeight <= 4.05, 'Moving world silhouette must stay full-sized');
            assert.equal(scale.bodyScale,1);
            assert.ok(scale.ratios.idle >= .95 && scale.ratios.idle <= 1.05);
            assert.ok(scale.ratios.walk >= .88 && scale.ratios.walk <= 1.05);
            assert.ok(scale.ratios.run >= .82 && scale.ratios.run <= 1.05);
        }
        assert.equal(walkScale.frameWorldHeight,runScale.frameWorldHeight);
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock<=0; });
        const directionalMotion = character === 'darya' ? await inspectDaryaMotion(page) : null;
        const observed = new Set();
        for (const keys of [['d'], ['d','s'], ['s'], ['a','s'], ['a'], ['a','w'], ['w'], ['d','w']]) {
            for (const key of keys) await page.keyboard.down(key);
            await page.waitForTimeout(character === 'darya' ? 240 : 100);
            await page.waitForFunction(() => {
                const actor = window.demianGameApplication.characterManager.activeEntity;
                return actor.state === 'walk' && actor.animator.currentFrameName()?.startsWith('world_');
            });
            const { direction, frame, version } = await page.evaluate(() => {
                const actor = window.demianGameApplication.characterManager.activeEntity;
                return { direction: actor.direction, frame: actor.animator.currentFrameName(), version: actor.atlas.meta.version };
            });
            assert.equal(version, 15);
            assert.ok(frame.startsWith('world_' + direction + '_walk-'), frame);
            observed.add(direction);
            for (const key of keys) await page.keyboard.up(key);
        }
        assert.deepEqual([...observed].sort(), ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
        await page.keyboard.down('Space');
        await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
        await page.keyboard.up('Space');
        await page.waitForFunction(() => { const e=window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock<=0; });
        await page.keyboard.press('o');
        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.state === 'celebrate');
        await page.screenshot({path:resolve(screenshots, `${character}-world-${width}.png`)});
        const games = ['open-world', 'dino-run'];
        for (const gameId of ['after-hours','cafe-rush','cafe-critters','coffee-crash','cafe-drift']) {
            await page.evaluate(gameId => window.demianGameApplication.launchGame(gameId), gameId);
            await page.waitForFunction(gameId => window.demianGameApplication.activeGameId === gameId
                && window.demianGameApplication.sessionState === 'playing', gameId, {timeout: 45000});
            if (gameId === 'after-hours' || gameId === 'cafe-rush') {
                const avatar = await page.evaluate(() => {
                    const game = window.demianGameApplication.activeGame;
                    const avatar = game.avatar ?? game.avatars?.player;
                    return { slug: avatar?.slug, version: avatar?.atlas.meta.version };
                });
                assert.deepEqual(avatar, { slug: character, version: 15 });
            }
            games.push(gameId);
        }
        await page.reload();
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        assert.equal(await page.evaluate(() => window.demianGameApplication.characterVisuals.activeSlug), character);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1), false);
        assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        report.viewports.push({width,height,selectedViaUi:true,previewLoaded:true,runnerJump:'passed',
            mobileProfile: device ? (engine === 'webkit' ? 'iPhone 13' : 'Pixel 7') : null,
            slide:touch?'native-touch-passed':'keyboard-passed',birdCleared:true,pack,directionalMotion,
            ...(character === 'darya' ? { pishiRunnerHop: 'passed' } : {}),
            cafeMovement:'passed',cafeJump:'passed',cafeCelebrate:'passed',selectionSurvivesReload:true,
            runnerBodyScale,walkScale,runScale,directions:[...observed],games,errors,failures});
        await context.close();
        console.log(`${character} browser QA passed: ${width}x${height}`);
    }
    report.status = 'passed';
} catch (error) {
    report.status='failed'; report.error=error.stack;
    for (const context of browser.contexts()) for (const page of context.pages()) {
        await page.screenshot({path:resolve(screenshots,'failure.png')}).catch(()=>{});
    }
    throw error;
} finally {
    await writeFile(resolve(out,character + (engine === 'webkit' ? '-webkit' : '') + '-browser-checks.json'), JSON.stringify(report,null,2)+'\n');
    await browser.close(); await new Promise(done=>server.close(done));
}
