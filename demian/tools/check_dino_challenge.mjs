import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve(import.meta.dirname, '../..'), playable = resolve(root, 'playable');
const out = resolve(root, 'demian/docs/validation/dino-challenge');
await mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(playable, `.${path.endsWith('/') ? path + 'index.html' : path}`);
        if (!file.startsWith(playable + '/')) throw new Error('Invalid path');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { browser: browser.version(), rendering: 'headless software Chromium', physicalDeviceMeasured: false,
    viewports: [], errors: [] };
try {
    for (const [width, height, seed, attacker] of [[1440, 900, 1, 'uzudi'], [390, 844, 3, 'amirreza'], [844, 390, 2, 'uzudi']]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
            isMobile: width < 1000, hasTouch: width < 1000, reducedMotion: width === 844 ? 'reduce' : 'no-preference' });
        const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        await page.evaluate(seed => window.demianGameApplication.launchGame('dino-run', { seed }), seed);
        await page.waitForFunction(() => window.demianGameApplication?.activeGame?.model.status === 'ready');
        assert.equal(await page.locator('[data-run-difficulty]').count(), 0);
        assert.ok(!(await page.locator('.runner-hud').innerText()).includes('سختی'));
        const ready = await page.evaluate(() => {
            const g = window.demianGameApplication.activeGame;
            return { attackerSprites: g.attackAvatars.size, spritesLoaded: [...g.attackAvatars.values()].every(a => a.texture.image.naturalWidth > 0),
                backgroundLoaded: Boolean(g.environment.image), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.equal(ready.attackerSprites, 4); assert.equal(ready.spritesLoaded, true);
        assert.equal(ready.backgroundLoaded, true); assert.equal(ready.overflow, false);
        await page.screenshot({ path: resolve(out, `ready-${width}x${height}.jpg`), quality: 90 });
        if (width < 1000) await page.locator('.runner-ready [data-input-press="jump"]').tap();
        else { await page.keyboard.down('Space'); await page.waitForTimeout(80); await page.keyboard.up('Space'); }
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.obstacles.length > 0);
        await page.screenshot({ path: resolve(out, `opening-${width}x${height}.jpg`), quality: 90 });
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'results', null, { timeout: 10000 });
        const loss = await page.evaluate(() => {
            const m = window.demianGameApplication.activeGame.model;
            return { reason: m.endReason, attacker: m.hitBy, time: m.time, score: m.score };
        });
        assert.equal(loss.reason, 'attack'); assert.equal(loss.attacker, attacker); assert.ok(loss.time < 1.6);
        await page.screenshot({ path: resolve(out, `loss-${width}x${height}.jpg`), quality: 90 });
        await page.evaluate(() => window.demianGameApplication.restartGame());
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'ready');
        const scene = await page.evaluate(() => {
            const app = window.demianGameApplication, g = app.activeGame;
            app.runtime.pause({ notifyGame: false }); g.model.status = 'running';
            g.model.spawnIn = 100;
            g.model.obstacles = [
                { id: 1, type: 'attacker', attacker: 'uzudi', response: 'jump', appearance: 'charge', x: 210, previousX: 210, y: 0, w: 40, h: 58 },
                { id: 2, type: 'attacker', attacker: 'amirreza', response: 'duck', appearance: 'pounce', x: 355, previousX: 355, y: 44, w: 40, h: 58 },
                { id: 3, type: 'cactus', appearance: 'floor-fan', x: 510, previousX: 510, y: 0, w: 44, h: 56 },
                { id: 4, type: 'cactus', appearance: 'traffic-cone', x: 620, previousX: 620, y: 0, w: 30, h: 46 }
            ];
            for (let i = 0; i < 25; i++) g.fixedUpdate(0);
            g.updateHud();
            g.fixedUpdate = () => {};
            app.runtime.resume({ notifyGame: false });
            g.render(1);
            return { reducedMotion: g.environment.reducedMotion,
                directions: [...g.attackAvatars.values()].map(a => a.direction) };
        });
        assert.ok(scene.directions.every(d => d === 'w')); assert.equal(scene.reducedMotion, width === 844);
        await page.waitForFunction(() => {
            const renderer = window.demianGameApplication.activeGame.context.renderer;
            const pixel = renderer.context2d.getImageData(20, Math.floor(renderer.canvas.height * .35), 1, 1).data;
            return pixel[0] + pixel[1] + pixel[2] > 80;
        });
        await page.screenshot({ path: resolve(out, `attackers-${width}x${height}.jpg`), quality: 90 });
        report.viewports.push({ width, height, input: width < 1000 ? 'emulated touch' : 'keyboard', ...ready, loss, ...scene });
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    await writeFile(resolve(out, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
