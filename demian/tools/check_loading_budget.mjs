import assert from 'node:assert/strict';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { BUILTIN_CHARACTER_SLUGS } from '../resources/js/game/characters/CharacterVisualContract.js';

const root = resolve(import.meta.dirname, '../_site');
const output = resolve(import.meta.dirname, '../docs/loading-budget');
const games = GAME_CATALOG.map(game => game.id);
const profiles = [{ name: 'phone', width: 390, height: 844, mobile: true },
    { name: 'desktop', width: 1366, height: 768, mobile: false }];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const report = { schema: 1, status: 'pending', budgetMs: 3000, physicalDeviceVerified: false,
    liveHostVerified: false, ranked: false, network: { downMbps: 8, latencyMs: 80, cpuSlowdown: 2 },
    evidence: 'Fresh Chromium contexts, uncompressed HTTP, Canvas environment draws and frame presentation; no hardware scanout claim.',
    baseline: [], candidate: [], failures: [] };
mkdirSync(output, { recursive: true });

function serve(directory) {
    return createServer((req, res) => {
        try {
            const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            if (path.includes('\\') || path.split('/').includes('..')) throw Error('path');
            const file = resolve(directory, path.replace(/^\/+/, '') || 'index.html');
            if (!file.startsWith(directory + sep) || !statSync(file).isFile()) throw Error('missing');
            res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
            res.setHeader('Content-Security-Policy', "connect-src 'self'");
            if (file.endsWith('index.html')) res.end(readFileSync(file, 'utf8')
                .replace(/(<meta name="demian-arcade-api" content=")[^"]*"/, '$1"')
                .replace(/(<meta name="demian-ops-client" content=")[^"]*"/, '$1off"'));
            else createReadStream(file).on('error', () => res.destroy()).pipe(res);
        } catch { res.writeHead(404); res.end(); }
    });
}

async function session(browser, origin, profile, initialSlug, operation) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
        isMobile: profile.mobile, hasTouch: profile.mobile, deviceScaleFactor: profile.mobile ? 2 : 1,
        serviceWorkers: 'block' });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80,
            downloadThroughput: 8 * 1024 * 1024 / 8, uploadThroughput: 2 * 1024 * 1024 / 8 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
        await page.addInitScript(slug => {
            localStorage.setItem('demian.character.slug.v1', slug);
            window.__budgetImages = new Map();
            const draw = CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
                const result = draw.call(this, image, ...args);
                if (image instanceof HTMLImageElement && image.naturalWidth) {
                    const path = new URL(image.src, document.baseURI).pathname;
                    if (!window.__budgetImages.has(path)) window.__budgetImages.set(path, performance.now());
                }
                return result;
            };
        }, initialSlug);
        await page.goto(origin + '/?startupQa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
        const menuMs = await page.evaluate(() => window.demianGameApplication.startupDiagnostics.report().page.menuReadyAtMs);
        await page.evaluate(mobile => {
            const app = window.demianGameApplication;
            if (app.leaderboards.connected) throw Error('Production API must be disabled');
            if (!mobile) app.performanceProfile.tier = 'high';
            window.__budgetFrames = 0;
            const present = app.rendererService.present.bind(app.rendererService);
            app.rendererService.present = (...args) => {
                const result = present(...args);
                if (result === true) window.__budgetFrames++;
                return result;
            };
        }, profile.mobile);
        const rows = await operation(page);
        assert.deepEqual(errors, [], 'Browser errors');
        return { menuMs, ...rows };
    } finally { await context.close(); }
}

async function launch(page, game, profile, mode) {
    await page.locator('[data-screen="cafe-menu"] [data-shell-action="play"]').click();
    await page.evaluate(() => {
        window.__budgetStart = performance.now();
        window.__budgetImages.clear();
    });
    const button = page.locator('[data-game-card="' + game + '"] [data-game-launch]');
    if (profile.mobile) await button.tap(); else await button.click();
    await page.waitForFunction(game => {
        const app = window.demianGameApplication;
        return app.firstPlayableFrame?.last?.gameId === game && app.sessionState === 'playing'
            && app.shell.loadingScreen.element.hidden;
    }, game, { timeout: 25000 });
    const firstMs = await page.evaluate(() => window.demianGameApplication.firstPlayableFrame.last.durationMs);
    // Café Drift draws its entire course before presenting the first playable frame.
    const environment = game === 'cafe-drift' ? null
        : game === 'dino-run' ? '/cafe-runner-v1/interior.webp' : '/polished-v1/preview.webp';
    if (environment) {
        await page.waitForFunction(suffix => [...window.__budgetImages.keys()].some(path => path.endsWith(suffix)),
            environment, { timeout: 25000 });
    }
    return page.evaluate(({ environment, firstMs, mode }) => {
        const app = window.demianGameApplication;
        const environmentMs = environment
            ? [...window.__budgetImages].find(([path]) => path.endsWith(environment))[1] - window.__budgetStart
            : firstMs;
        const diagnostic = app.startupDiagnostics.report().gameStarts.at(-1);
        return { mode, firstMs, environmentMs: Math.max(firstMs, environmentMs),
            stages: diagnostic, qualityTier: app.performanceProfile.tier,
            requests: performance.getEntriesByType('resource').filter(row => row.startTime >= window.__budgetStart)
                .map(row => ({ path: new URL(row.name).pathname, bytes: row.encodedBodySize, ms: row.duration })) };
    }, { environment, firstMs, mode });
}

async function measure(browser, directory, label) {
    const server = serve(directory);
    const slugs = label === 'candidate' ? BUILTIN_CHARACTER_SLUGS
        : JSON.parse(readFileSync(resolve(directory, 'characters.json'), 'utf8')).data.map(character => character.slug);
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const target = report[label];
    try {
        for (const profile of profiles) {
            for (const game of games) for (let sample = 0; sample < 2; sample++) {
                const row = { type: 'game', profile: profile.name, game, sample };
                try {
                    Object.assign(row, await session(browser, origin, profile, 'darya', async page => {
                        const cold = await launch(page, game, profile, 'cold');
                        await page.evaluate(() => window.demianGameApplication.showMenu());
                        const warm = await launch(page, game, profile, 'warm');
                        if (sample === 0) await page.screenshot({ path: resolve(output, label + '-' + profile.name + '-' + game + '.png') });
                        return { cold, warm };
                    }));
                    row.passed = [row.menuMs, row.cold.firstMs, row.cold.environmentMs,
                        row.warm.firstMs, row.warm.environmentMs].every(ms => Number.isFinite(ms) && ms < 3000);
                } catch (error) { row.passed = false; row.error = String(error); }
                target.push(row);
                writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
                console.log('[Loading budget]', label, JSON.stringify({ ...row, cold: row.cold && {
                    firstMs: row.cold.firstMs, environmentMs: row.cold.environmentMs }, warm: row.warm && {
                    firstMs: row.warm.firstMs, environmentMs: row.warm.environmentMs } }));
            }
            for (const slug of slugs) {
                const row = { type: 'character-switch', profile: profile.name, slug };
                try {
                    Object.assign(row, await session(browser, origin, profile, slug === 'darya' ? 'amirreza' : 'darya', async page => {
                        await page.evaluate(async () => {
                            const app = window.demianGameApplication;
                            app.eventBus.on('game:first-playable-frame', () => {
                                app.activeGame.characterManager.hydrationGeneration++;
                                app.characterVisuals.cancelBackgroundLoads();
                            });
                            await app.launchGame('open-world');
                        });
                        await page.waitForFunction(() => window.demianGameApplication.firstPlayableFrame.last);
                        return page.evaluate(async slug => {
                            const app = window.demianGameApplication;
                            const manager = app.activeGame.characterManager;
                            const record = manager.characters.find(row => row.slug === slug);
                            const started = performance.now();
                            await manager.select(record.id, { hydrateRoster: false });
                            const frame = window.__budgetFrames;
                            await new Promise(resolve => {
                                const deadline = performance.now() + 10000;
                                const check = () => window.__budgetFrames > frame || performance.now() > deadline ? resolve() : requestAnimationFrame(check);
                                requestAnimationFrame(check);
                            });
                            if (window.__budgetFrames <= frame) throw Error('Character presentation timed out');
                            const entity = manager.activeEntity;
                            if (entity.character.slug !== slug || !entity.texture?.image?.naturalWidth) throw Error('Character art missing');
                            return { durationMs: performance.now() - started, variant: entity.runtimeSpriteVariant,
                                requests: performance.getEntriesByType('resource').filter(row => row.startTime >= started)
                                    .map(row => ({ path: new URL(row.name).pathname, bytes: row.encodedBodySize, ms: row.duration })) };
                        }, slug);
                    }));
                    row.passed = Number.isFinite(row.durationMs) && row.durationMs < 3000;
                } catch (error) { row.passed = false; row.error = String(error); }
                target.push(row);
                writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
                console.log('[Loading budget]', label, JSON.stringify({ ...row, requests: undefined }));
            }
        }
    } finally { await new Promise(done => server.close(done)); }
}

let browser;
try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        ...(process.env.DEMIAN_CHROMIUM_PATH ? { executablePath: process.env.DEMIAN_CHROMIUM_PATH } : {}) });
    if (process.env.DEMIAN_FIRST_FRAME_BASELINE) await measure(browser, resolve(process.env.DEMIAN_FIRST_FRAME_BASELINE), 'baseline');
    await measure(browser, root, 'candidate');
    report.failures = report.candidate.filter(row => !row.passed).map(({ type, profile, game, slug, sample, error }) =>
        ({ type, profile, game, slug, sample, error }));
    assert.equal(report.candidate.length, profiles.length * (games.length * 2 + BUILTIN_CHARACTER_SLUGS.length));
    assert.deepEqual(report.failures, [], 'Every cold/warm launch, environment and character switch must be below 3 seconds');
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
    await browser?.close();
    writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('[Loading budget result]', report.status, JSON.stringify(report.failures));
}
