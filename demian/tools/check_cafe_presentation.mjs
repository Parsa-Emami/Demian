import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..'), release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(root, '_site'));
const baseline = process.argv.includes('--baseline');
const output = resolve(process.env.DEMIAN_QA_OUTPUT_DIR ?? resolve(root, 'docs/validation/cafe-presentation-v1', baseline ? 'baseline' : 'current'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (!path.startsWith('/Demian/')) throw Error('Unknown base');
        path = path.slice(7); if (path.endsWith('/')) path += 'index.html';
        const file = resolve(release, `.${path}`);
        if (!file.startsWith(release + '/')) throw Error('Outside release');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
    const cases = [
        { name: 'desktop-performance', width: 1440, height: 900, quality: 'performance', memory: 2, cores: 4 },
        { name: 'phone-performance', width: 390, height: 844, quality: 'performance', memory: 2, cores: 4, mobile: true },
        { name: 'desktop-balanced', width: 1440, height: 900, quality: 'balanced', memory: 4, cores: 8 },
        { name: 'desktop-high', width: 1440, height: 900, quality: 'high', memory: 16, cores: 12 },
    ];
    for (const scenario of cases.filter(s => !process.env.DEMIAN_QA_CASE || s.name === process.env.DEMIAN_QA_CASE)) {
        const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height },
            deviceScaleFactor: 1, hasTouch: Boolean(scenario.mobile), isMobile: Boolean(scenario.mobile) });
        await context.addInitScript(s => {
            Object.defineProperty(navigator, 'deviceMemory', { get: () => s.memory });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => s.cores });
            localStorage.clear();
            localStorage.setItem('demian.platform.settings.v1', JSON.stringify({ quality: s.quality }));
        }, scenario);
        const page = await context.newPage(), errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', req => requests.push(req.url()));
        await page.goto(`http://127.0.0.1:${server.address().port}/Demian/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 60000 });
        await page.locator('[data-screen="cafe-menu"] [data-shell-action="continue"]').click();
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => {
            const g = window.demianGameApplication.activeGame;
            g.characterManager.setPosition(g.manifest.spawn);
            g.focusCharacter({ close: true });
        });
        if (!baseline) await page.waitForFunction(() => {
            const stream = window.demianGameApplication.activeGame.pixelRenderer.cafe.stream;
            return stream && stream.stats().ready > 0 && stream.stats().active === 0;
        }, null, { timeout: 30000 });
        const measurement = await page.evaluate(async () => {
            const g = window.demianGameApplication.activeGame, r = g.pixelRenderer;
            await new Promise(done => setTimeout(done, 700));
            const render = r.render, times = [];
            r.render = function(...args) { const start = performance.now(); const result = render.apply(this, args); times.push(performance.now() - start); return result; };
            await new Promise(done => setTimeout(done, 1600));
            r.render = render; times.sort((a, b) => a - b);
            return { samples: times.length, medianMs: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)],
                cache: r.sceneCache.stats(), art: r.cafe.stream?.stats?.() ?? null,
                tier: g.context.services.performanceProfile.tier, camera: { mode: r.mode, position: r.camera.position, ppu: r.camera.pixelsPerUnit },
                position: g.characterManager.position(), colliders: g.staticColliders.length, character: g.characterManager.activeRecord.slug };
        });
        assert.equal(measurement.colliders, 321); assert.equal(measurement.character, 'darya');
        assert(measurement.samples > 0); assert(measurement.cache.hits > 0);
        assert.equal(requests.some(url => url.includes('cafe.glb')), false);
        await page.screenshot({ path: resolve(output, scenario.name + '.png') });
        if (!baseline) {
            assert.equal(measurement.art.quality, scenario.quality);
            assert(measurement.art.ready <= measurement.art.maxTiles);
            assert(measurement.art.decodedBytes <= measurement.art.maxDecodedBytes);
            const start = await page.evaluate(() => window.demianGameApplication.activeGame.characterManager.position());
            await page.keyboard.down('ArrowUp');
            await page.waitForFunction(start => {
                const p = window.demianGameApplication.activeGame.characterManager.position();
                return Math.hypot(p.x - start.x, p.z - start.z) > .15;
            }, start);
            await page.keyboard.up('ArrowUp');
            if (scenario.mobile) await page.locator('[data-input-press="jump"]:visible').first().tap();
            else await page.keyboard.press('Space');
            await page.waitForFunction(() => !window.demianGameApplication.activeGame.characterManager.activeEntity.grounded);
            await page.waitForFunction(() => window.demianGameApplication.activeGame.characterManager.activeEntity.grounded);
            await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const point = g.manifest.savePoint('save-entrance').position;
                g.characterManager.setPosition({ x: point.x, z: point.z + 1.2 });
            });
            await page.waitForFunction(() => [...document.querySelectorAll('[data-interaction-label]')].some(e => e.getClientRects().length && e.textContent.includes('ذخیره')), null, { timeout: 5000 });
            if (scenario.mobile) await page.locator('[data-input-press="interact"]:visible').first().tap();
            else await page.keyboard.press('Enter');
            await page.waitForFunction(() => window.demianGameApplication.activeGame.savePoints.lastSavePointId === 'save-entrance');
            await page.evaluate(() => window.demianGameApplication.settings.update({ quality: 'high' }));
            await page.waitForFunction(() => window.demianGameApplication.activeGame.pixelRenderer.cafe.stream.stats().quality === 'high');
            await page.waitForFunction(() => {
                const labels = [...document.querySelectorAll('[data-quality-label]')];
                return labels.length > 0 && labels.every(label => label.textContent === 'HIGH');
            });
            await page.evaluate(async () => {
                const g = window.demianGameApplication.activeGame, point = g.manifest.savePoint('save-restroom');
                g.discovery.unlockSavePoint(point.id); await g.fastTravel(point);
            });
            await page.waitForFunction(() => window.demianGameApplication.activeGame.pixelRenderer.cafe.stream.stats().active === 0);
            const traveled = await page.evaluate(() => window.demianGameApplication.activeGame.characterManager.position());
            assert(Math.abs(traveled.z + 119.16) < 1);
            await page.screenshot({ path: resolve(output, scenario.name + '-rear.png') });
            await page.getByRole('button', { name: 'بازگشت به منو', exact: true }).click();
            await page.waitForFunction(() => window.demianGameApplication.sessionState === 'menu');
        }
        assert.deepEqual(errors, []);
        results.push({ ...scenario, measurement, movementJumpInteraction: !baseline, phoneTouchJumpAndInteraction: !baseline && Boolean(scenario.mobile),
            errors, artRequests: requests.filter(u => /floorplan|polished-v1/.test(u)) });
        console.log(scenario.name + ': passed');
        await context.close();
    }
    if (!baseline) for (const allArt of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await context.newPage(), errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (r.url().includes('polished-v1')) requests.push(r.url()); });
        await page.route('**/polished-v1/**', route => !allArt && route.request().url().includes('preview.webp')
            ? route.continue() : route.fulfill({ status: 503, body: 'QA unavailable' }));
        await page.goto(`http://127.0.0.1:${server.address().port}/Demian/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 60000 });
        await page.locator('[data-screen="cafe-menu"] [data-shell-action="continue"]').click();
        await page.waitForFunction(() => window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({ close: true }));
        await page.waitForFunction(() => window.demianGameApplication.activeGame.pixelRenderer.cafe.stream.stats().failed > 0);
        await page.waitForFunction(() => {
            const s = window.demianGameApplication.activeGame.pixelRenderer.cafe.stream.stats();
            return s.active === 0 && s.queued === 0;
        });
        const requestCount = requests.length;
        await page.waitForTimeout(1000);
        const state = await page.evaluate(() => ({ art: window.demianGameApplication.activeGame.pixelRenderer.cafe.stream.stats(),
            colliders: window.demianGameApplication.activeGame.staticColliders.length }));
        assert.equal(state.art.ready, 0); assert.equal(state.colliders, 321); assert.deepEqual(errors, []);
        assert.equal(requests.length, requestCount);
        await page.screenshot({ path: resolve(output, allArt ? 'all-art-unavailable.png' : 'detail-unavailable.png') });
        results.push({ name: allArt ? 'all-art-unavailable' : 'detail-unavailable', state, errors, noRetryStorm: true });
        await context.close();
    }
    await writeFile(resolve(output, 'browser-checks.json'), JSON.stringify({ baseline, rendering: 'headless Chromium, software SwiftShader', physicalDeviceTests: false,
        timings: 'Canvas submission duration; not GPU frame time or physical-device FPS', results }, null, 2) + '\n');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
