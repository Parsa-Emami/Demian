import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUILTIN_CHARACTER_SLUGS } from '../resources/js/game/characters/CharacterVisualContract.js';

const project = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(project, '_site'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/release-v15-quality'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = resolve(release, `.${path}`);
        if (!file.startsWith(`${release}/`)) throw new Error('Outside release');
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = { status: 'running', physicalHardwareMeasured: false, profiles: [] };
try {
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    report.browser = browser.version();
    for (const profile of [
        { name: 'desktop', width: 1440, height: 900, memory: 8, cores: 12, tier: 'high', variant: 'detail' },
        { name: 'mobile', width: 390, height: 844, memory: 2, cores: 4, tier: 'performance', variant: 'lite' },
    ]) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
            deviceScaleFactor: 2, isMobile: profile.name === 'mobile', hasTouch: profile.name === 'mobile' });
        await context.addInitScript(({ memory, cores }) => {
            Object.defineProperty(navigator, 'deviceMemory', { get: () => memory });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
        }, profile);
        const page = await context.newPage();
        const errors = [], failures = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failures.push(new URL(response.url()).pathname); });
        page.on('request', request => requests.push(new URL(request.url()).pathname));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        assert.equal(await page.evaluate(() => window.demianGameApplication.performanceProfile.tier), profile.tier);
        await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
        await page.waitForFunction(() => window.demianGameApplication.activeGameId === 'open-world'
            && window.demianGameApplication.sessionState === 'playing');
        await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({ close: true }));
        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.grounded);
        if (profile.tier === 'high') await page.waitForFunction(() => window.demianGameApplication.activeGame.pixelRenderer.cafe.revision >= 2);
        const world = await page.evaluate(() => {
            const app = window.demianGameApplication;
            return { variant: app.characterManager.activeEntity.atlas.meta.variant,
                detailEnvironment: app.activeGame.pixelRenderer.cafe.detail, pixelSnap: app.activeGame.pixelRenderer.camera.pixelSnap,
                dimensions: app.rendererService.logicalDimensions() };
        });
        assert.equal(world.variant, profile.variant); assert.equal(world.pixelSnap, false);
        assert.equal(world.detailEnvironment, profile.tier === 'high');
        assert.ok(world.dimensions.width * world.dimensions.height <= (profile.tier === 'high' ? 2200000 : 1250000));
        let distance = 0;
        for (const key of ['d', 'a', 'w', 's']) {
            const start = await page.evaluate(() => {
                const p = window.demianGameApplication.characterManager.activeEntity.group.position; return { x: p.x, z: p.z };
            });
            await page.keyboard.down(key); await page.keyboard.down('Shift'); await page.waitForTimeout(350);
            distance = await page.evaluate(start => {
                const p = window.demianGameApplication.characterManager.activeEntity.group.position; return Math.hypot(p.x - start.x, p.z - start.z);
            }, start);
            await page.keyboard.up(key); await page.keyboard.up('Shift'); if (distance > .05) break;
        }
        assert.ok(distance > .05);
        await page.waitForFunction(() => { const e = window.demianGameApplication.characterManager.activeEntity; return e.grounded && e.stateLock <= 0; });
        await page.keyboard.down('Space');
        await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
        await page.keyboard.up('Space');
        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.grounded);
        await page.screenshot({ path: resolve(out, `world-${profile.name}.png`) });
        await page.evaluate(() => window.demianGameApplication.launchGame('dino-run'));
        await page.waitForFunction(() => window.demianGameApplication.activeGame?.model?.status === 'ready');
        await page.locator('.runner-ready button').click();
        await page.waitForFunction(() => window.demianGameApplication.activeGame.model.status === 'running');
        await page.evaluate(() => { const model = window.demianGameApplication.activeGame.model; model.spawnIn = 999; model.obstacles = []; });
        const characters = [];
        for (const slug of BUILTIN_CHARACTER_SLUGS) {
            await page.evaluate(slug => window.demianGameApplication.activeGame.selectCharacter(slug), slug);
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
            const pack = await page.evaluate(() => {
                const a = window.demianGameApplication.activeGame.avatar;
                return { slug: a.slug, variant: a.atlas.meta.variant, cell: a.atlas.meta.frameSize.w, decodedBytes: a.atlas.meta.decodedBytes,
                    revision: new URL(a.texture.image.src).searchParams.get('sprite_rev'), expectedRevision: a.atlas.meta.imageRevision };
            });
            assert.equal(pack.slug, slug); assert.equal(pack.variant, profile.variant);
            assert.equal(pack.cell, profile.tier === 'high' ? 128 : 64); assert.equal(pack.revision, pack.expectedRevision);
            await page.keyboard.down('Space');
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 8);
            await page.keyboard.up('Space');
            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
            await page.keyboard.down('ArrowDown');
            await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.state === 'slide');
            await page.keyboard.up('ArrowDown');
            characters.push({ ...pack, jump: 'passed', landing: 'passed', slide: 'passed' });
            console.log(`Visual QA ${profile.name}: ${slug}`);
        }
        await page.screenshot({ path: resolve(out, `runner-${profile.name}.png`) });
        const runtimeErrors = await page.evaluate(() => [...window.demianGameApplication.runtime.errorCounts.entries()]);
        assert.deepEqual(runtimeErrors, []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        if (profile.tier === 'performance') {
            assert.equal(requests.some(path => path.endsWith('-detail.png')), false);
            assert.equal(requests.some(path => path.endsWith('floorplan-detail.webp')), false);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        report.profiles.push({ ...profile, world, distanceMoved: distance, characters, errors, failures, runtimeErrors });
        await context.close();
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.error = error.stack;
    for (const context of browser?.contexts() ?? []) for (const page of context.pages()) await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await writeFile(resolve(out, 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close(); await new Promise(done => server.close(done));
}
