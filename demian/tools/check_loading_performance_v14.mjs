/** Browser regressions for decode failure, slow loading, selection order and scene-cache reuse. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, 'demian/docs/release-v14-negar');
const screenshotDir = resolve(process.env.DEMIAN_QA_SCREENSHOT_DIR ?? resolve(tmpdir(), 'demian-negar-v14-loading'));
const playable = resolve(root, 'playable');
const modulePath = process.env.DEMIAN_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
await mkdir(out, { recursive: true });
await mkdir(screenshotDir, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = resolve(playable, `.${path}`);
        if (!file.startsWith(`${playable}/`)) throw new Error('Outside export');
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-gpu'] });
const results = { browser: browser.version(), physicalPhoneMeasured: false, cases: [] };
try {
    for (const scenario of ['slow-phone', 'failed-runtime-image']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        await context.addInitScript(({ constrained }) => {
            Object.defineProperty(navigator, 'deviceMemory', { get: () => constrained ? 2 : 8 });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => constrained ? 4 : 8 });
            localStorage.setItem('demian.character.slug.v1', 'negar');
        }, { constrained: scenario === 'slow-phone' });
        if (scenario === 'failed-runtime-image') await context.route('**/negar-spritesheet-v14-runtime.png',
            (route) => route.fulfill({ status: 503, body: 'deliberately unavailable' }));
        const page = await context.newPage(); const errors = [], sheets = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('request', (request) => {
            if (/spritesheet-v14-.*\.png/.test(request.url())) sheets.push(new URL(request.url()).pathname);
        });
        const cdp = await context.newCDPSession(page);
        if (scenario === 'slow-phone') {
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120,
                downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024, connectionType: 'cellular4g' });
        }
        const coldBootStarted = Date.now();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 60000 });
        const coldBootMs = Date.now() - coldBootStarted;
        const started = Date.now();
        await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.characterManager?.activeRecord?.slug === 'negar', null, { timeout: 60000 });
        const elapsedMs = Date.now() - started;
        if (scenario === 'slow-phone') {
            await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        }
        await page.waitForFunction(() => window.demianGameApplication.activeGame.characterManager.entities.size >= 3, null, { timeout: 45000 });
        const state = await page.evaluate(() => {
            const app = window.demianGameApplication, game = app.activeGame;
            return { slug: game.characterManager.activeRecord.slug, variant: game.characterManager.activeEntity.runtimeSpriteVariant,
                ability: game.characterManager.activeEntity.abilityController.primary.id,
                bounds: game.manifest.bounds, entities: game.characterManager.entities.size,
                decodedCacheBytes: [...game.context.services.characterVisuals.packCache.values()].reduce((sum, pack) =>
                    sum + pack.image.naturalWidth * pack.image.naturalHeight * 4, 0) };
        });
        assert.equal(state.variant, 'lite'); assert.equal(state.ability, 'smile-bloom');
        assert.deepEqual(state.bounds, { minX: -24, maxX: 24, minZ: -132, maxZ: 36 });
        assert.ok(state.decodedCacheBytes <= 24 * 1024 * 1024);
        assert.ok(!sheets.some((url) => /-(desktop|mobile|compact)\.png/.test(url)));
        assert.deepEqual(errors, []);
        if (scenario === 'failed-runtime-image') {
            // Simulate two overlapping selections resolving in the opposite order.
            const selected = await page.evaluate(async () => {
                const app = window.demianGameApplication, manager = app.activeGame.characterManager;
                app.runtime.pause();
                const actual = manager.ensureEntity.bind(manager);
                manager.ensureEntity = async (record, ...args) => {
                    await new Promise((done) => setTimeout(done, record.slug === 'setayesh' ? 200 : 10));
                    return actual(record, ...args);
                };
                await Promise.all([manager.select(manager.characters.find((r) => r.slug === 'setayesh').id),
                    manager.select(manager.characters.find((r) => r.slug === 'uzudi').id)]);
                manager.ensureEntity = actual;
                return manager.activeRecord.slug;
            });
            assert.equal(selected, 'uzudi');
            await page.evaluate(async () => {
                const game = window.demianGameApplication.activeGame;
                await game.characterManager.select(game.characterManager.characters.find((r) => r.slug === 'negar').id);
            });
            const cache = await page.evaluate(() => {
                const app = window.demianGameApplication, game = app.activeGame;
                game.pixelRenderer.setMode('FOLLOW', game.characterManager.position(), { immediate: true });
                game.renderScene({ strict: true });
                const before = game.pixelRenderer.sceneCache.stats();
                const start = performance.now();
                for (let i = 0; i < 120; i++) game.renderScene({ strict: true });
                const renderMs = performance.now() - start, after = game.pixelRenderer.sceneCache.stats();
                return { before, after, renderMs, frames: 120 };
            });
            assert.ok(cache.after.hits - cache.before.hits >= 119);
            assert.ok(cache.after.builds - cache.before.builds <= 1);
            assert.ok(cache.after.bytes <= 8800000);
            for (const [area, x, z] of [['entrance', 0, 28.4], ['lounge', 1.6, -58], ['washroom', 6.6, -118]]) {
                await page.evaluate(({ x, z }) => {
                    const game = window.demianGameApplication.activeGame;
                    game.characterManager.setPosition({ x, z });
                    game.pixelRenderer.setMode('FOLLOW', { x, z }, { immediate: true });
                    game.renderScene({ strict: true });
                }, { x, z });
                await page.screenshot({ path: resolve(screenshotDir, `cafe-simple-${area}-390.png`) });
            }
            assert.equal(sheets.filter((url) => url.endsWith('negar-spritesheet-v14-runtime.png')).length, 1,
                'one failed decode is remembered during selection and NPC hydration');
            results.cases.push({ scenario, coldBootMs, sessionStartMs: elapsedMs, state, sheets, errors, overlappingSelection: selected, cache });
        } else results.cases.push({ scenario, coldBootMs, sessionStartMs: elapsedMs, state, sheets, errors,
            cpuThrottle: 4, network: '200 KiB/s, 120 ms latency, cold browser cache' });
        await context.close();
    }
    await writeFile(resolve(out, 'loading-performance.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
