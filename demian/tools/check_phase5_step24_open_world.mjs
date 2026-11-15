import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/phase5-step24');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Static release must be built');
mkdirSync(output, { recursive: true });

const mime = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path.includes('\\') || path.split('/').includes('..')) throw Error('Invalid path');
        const file = resolve(root, path.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Missing file');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
});

const report = {
    schema: 1, status: 'pending', physicalDeviceVerified: false,
    liveApiScoreVerified: false, environments: [], errors: [],
    limitations: [
        'Playwright emulates screen size and touch support; it is not physical iOS Safari/Android Chrome.',
        'No production API is configured in the static test release; live HTTPS score submission must be separately accepted.',
        'A local practice-only fast-travel stress path is used to load and evict chunks; it does not constitute a ranked route proof.',
    ],
};
let browser;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const address = 'http://127.0.0.1:' + server.address().port + '/';
    const viewports = [
        { label: 'mobile-narrow', width: 320, height: 568, mobile: true },
        { label: 'mobile-portrait', width: 390, height: 844, mobile: true },
        { label: 'mobile-landscape', width: 844, height: 390, mobile: true },
        { label: 'desktop', width: 1440, height: 900, mobile: false },
    ];
    for (const { label, width, height, mobile } of viewports) {
        const context = await browser.newContext({
            viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
            hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 20000 });
            await page.evaluate(() => window.demianGameApplication.launchGame('open-world'));
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'playing', null, { timeout: 40000 });
            await page.waitForFunction(() => {
                const game = window.demianGameApplication.activeGame;
                return game?.firstFrameRendered && game?.chunkManager?.stats().loaded >= 1;
            }, null, { timeout: 20000 });

            const initial = await page.evaluate(() => {
                const a = window.demianGameApplication;
                const g = a.activeGame;
                return {
                    gameId: a.activeGameId, mode: a.root.dataset.controlLayout,
                    inputContext: a.root.dataset.inputContext,
                    firstFrame: g.firstFrameRendered,
                    renderState: a.container.dataset.openWorldRenderState,
                    loaded: g.chunkManager.stats().loaded,
                    budget: g.chunkManager.stats().maxLoadedChunks,
                    active: g.chunkManager.stats().active,
                    savedItems: g.finds.count(),
                    overflow: document.documentElement.scrollWidth > innerWidth + 2,
                    camera: g.cameraController.mode,
                };
            });
            assert.equal(initial.gameId, 'open-world');
            assert.equal(initial.inputContext, 'OPEN_WORLD');
            assert.equal(initial.firstFrame, true);
            assert.equal(initial.renderState, 'ready');
            assert.equal(initial.overflow, false);
            assert.ok(initial.loaded <= initial.budget);

            const movement = await page.evaluate(() => {
                const p = window.demianGameApplication.activeGame.characterManager.position();
                return { x: p.x, z: p.z };
            });
            let actualMovement = false;
            for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
                await page.keyboard.down(key);
                await page.waitForTimeout(230);
                await page.keyboard.up(key);
                const moved = await page.evaluate(() => {
                    const p = window.demianGameApplication.activeGame.characterManager.position();
                    return { x: p.x, z: p.z };
                });
                if (Math.hypot(moved.x - movement.x, moved.z - movement.z) > .02) {
                    actualMovement = true;
                    break;
                }
            }
            assert.equal(actualMovement, true, 'Real keyboard input must move the Open World character');

            const stress = await page.evaluate(async (iterations) => {
                const g = window.demianGameApplication.activeGame;
                const points = g.manifest.savePoints;
                const readings = [];
                for (let index = 0; index < iterations; index++) {
                    const point = points[index % points.length];
                    g.savePoints.activate(point.id);
                    const accepted = await g.fastTravel(point);
                    if (!accepted) throw Error('Local fast travel was unexpectedly rejected: ' + point.id);
                    await g.chunkManager.whenIdle();
                    const stats = g.chunkManager.stats();
                    readings.push({
                        index, loaded: stats.loaded, queued: stats.queued,
                        loading: stats.loading, handles: g.chunkRenderer.handles.size,
                        currentChunkId: stats.currentChunkId,
                    });
                    if (stats.loaded > stats.maxLoadedChunks || g.chunkRenderer.handles.size > stats.maxLoadedChunks) {
                        throw Error('Chunk/handle memory budget exceeded: ' + JSON.stringify(stats));
                    }
                }
                return readings;
            }, label === 'mobile-portrait' ? 28 : 7);
            assert.ok(stress.length >= 7 && stress.every(item => item.loaded <= initial.budget));

            const exploration = await page.evaluate(async () => {
                const g = window.demianGameApplication.activeGame;
                if (g.routeChallenge?.state !== 'idle') throw Error('QA can only collect during local exploration');
                let target = null;
                for (const chunk of g.manifest.chunks) {
                    const item = g.chunkManager.loaded.get(chunk.id)?.handle?.find;
                    if (item && !g.finds.has(item.id)) {
                        target = item;
                        break;
                    }
                }
                if (!target) {
                    const candidate = g.manifest.chunks.find(chunk => chunk.id !== g.currentChunk?.id);
                    if (candidate) {
                        g.chunkManager.update(candidate.center);
                        await g.chunkManager.whenIdle();
                        target = [...g.chunkManager.loaded.values()].map(record => record.handle?.find)
                            .find(item => item && !g.finds.has(item.id)) ?? null;
                    }
                }
                const before = g.finds.count();
                if (target) {
                    g.characterManager.setPosition(target.position);
                    g.updateStreaming(true);
                    await g.chunkManager.whenIdle();
                    g.fixedUpdate(1 / 60, {});
                    g.update(1 / 60);
                    const after = g.finds.count();
                    if (after !== before + 1) {
                        throw Error('Find pickup failed at practice position: ' + JSON.stringify({
                            before, after, target,
                        }));
                    }
                    if (!g.saveStore.load({ worldId: g.manifest.id, maxWorldVersion: g.manifest.version })
                        ?.finds?.includes(target.id)) {
                        throw Error('Find was not saved to the local checksummed world save');
                    }
                }
                return { target: target?.id ?? null, before, after: g.finds.count(),
                    hud: g.hud.root.querySelector('[data-world-finds]')?.textContent,
                    rendered: g.renderScene({ phase: 'step24-qa', strict: true }),
                };
            });
            assert.equal(exploration.rendered, true);
            if (exploration.target) assert.equal(exploration.after, exploration.before + 1);

            const camera = await page.evaluate(() => {
                const g = window.demianGameApplication.activeGame;
                const before = g.cameraController.mode;
                g.toggleCamera();
                const after = g.cameraController.mode;
                g.toggleCamera();
                return { before, after, final: g.cameraController.mode,
                    drawn: g.renderScene({ phase: 'camera-qa', strict: true }) };
            });
            assert.notEqual(camera.before, camera.after);
            assert.equal(camera.before, camera.final);
            assert.equal(camera.drawn, true);

            const rankedGuard = await page.evaluate(async () => {
                const g = window.demianGameApplication.activeGame;
                const count = g.finds.count();
                g.routeChallenge.state = 'running';
                g.fixedUpdate(1 / 60, {});
                const intact = g.finds.count() === count;
                g.routeChallenge.state = 'idle';
                return { intact, count };
            });
            assert.equal(rankedGuard.intact, true);
            if (label === 'mobile-portrait') {
                await page.screenshot({
                    path: resolve(output, 'open-world-390.png'), animations: 'disabled',
                });
            }

            const old = await page.evaluate(() => {
                const a = window.demianGameApplication;
                window.__openWorldOld = a.activeGame;
                return { loaded: a.activeGame.chunkManager.stats().loaded,
                    tracked: a.activeGame.aiBudget.stats().tracked };
            });
            await page.evaluate(() => window.demianGameApplication.showMenu());
            await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 20000 });
            await page.waitForFunction(() => window.__openWorldOld?.chunkManager?.stats().loaded === 0
                && window.__openWorldOld?.chunkRenderer?.handles.size === 0, null, { timeout: 10000 });
            const cleanup = await page.evaluate(() => {
                const g = window.__openWorldOld;
                const state = { loaded: g.chunkManager.stats().loaded,
                    handles: g.chunkRenderer.handles.size,
                    tracked: g.aiBudget.stats().tracked };
                delete window.__openWorldOld;
                return state;
            });
            assert.deepEqual(cleanup, { loaded: 0, handles: 0, tracked: 0 });
            assert.deepEqual(errors, [], 'Open World must have no uncaught browser error');

            report.environments.push({
                label, viewport: [width, height], mobileEmulated: mobile,
                status: 'passed', firstFrame: initial.firstFrame,
                walkingInput: actualMovement, initialChunks: initial.loaded,
                peakLoadedChunks: Math.max(...stress.map(x => x.loaded)),
                peakChunkHandles: Math.max(...stress.map(x => x.handles)),
                transfers: stress.length, exploration, camera,
                rankedLocalCollectionIsolated: rankedGuard.intact,
                resourcesReleased: cleanup, beforeDispose: old,
            });
        } finally {
            await context.close();
        }
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(error.stack ?? String(error));
} finally {
    writeFileSync(resolve(output, 'open-world-browser.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (report.status !== 'passed') {
    console.error('[Step 24] Open World browser QA failed:', report.errors);
    process.exitCode = 1;
} else console.log('[Step 24] Open World browser QA passed:', report.environments);
