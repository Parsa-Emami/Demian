/**
 * Mobile-01: reproducible LAB baseline, not proof of physical-device performance.
 * This runner deliberately does not modify gameplay, upload telemetry, or store PII.
 *
 * Usage: npm run benchmark:mobile:ci
 * Optional: DEMIAN_MOBILE_BENCH_PROFILE=low-mobile npm run benchmark:mobile
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { BUDGETS, MOBILE_GAME_IDS, evaluateAdvisoryBudget, inventoryRelease, summarizeNetwork } from './mobile_benchmark_metrics.mjs';

const project = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_BENCH_RELEASE_DIR ?? resolve(project, '_site'));
const output = resolve(process.env.DEMIAN_BENCH_REPORT_DIR ?? resolve(project, 'docs/mobile-01/baseline'));
const profileName = process.env.DEMIAN_MOBILE_BENCH_PROFILE || 'mid-mobile';
const profiles = {
    'mid-mobile': { width: 390, height: 844, dpr: 2, cpuSlowdown: 2, latencyMs: 80, downloadBytesPerSecond: 3_000_000 },
    'low-mobile': { width: 320, height: 568, dpr: 1, cpuSlowdown: 4, latencyMs: 150, downloadBytesPerSecond: 950_000 },
};
const profile = profiles[profileName];
if (!profile) throw new Error('Unknown DEMIAN_MOBILE_BENCH_PROFILE: ' + profileName);
if (!existsSync(resolve(release, 'index.html'))) throw new Error('Build static export first: npm run build:static');

const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json', '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8',
};
const prefix = '/relocated/demian/';
const server = createServer((request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (!pathname.startsWith(prefix)) throw new Error('Outside release');
        const part = pathname.slice(prefix.length) || 'index.html';
        if (part.includes('\\') || part.split('/').includes('..')) throw new Error('Unsafe path');
        const target = resolve(release, part.endsWith('/') ? part + 'index.html' : part);
        if (!target.startsWith(release + sep) || !statSync(target).isFile()) throw new Error('Not a file');
        const type = mime[extname(target).toLowerCase()] ?? 'application/octet-stream';
        response.setHeader('Content-Type', type);
        // Simulates immutable hashed build files, not a claim about the user's hosting configuration.
        response.setHeader('Cache-Control', /\/build\/assets\/[^/]+-[A-Za-z0-9_-]+\./.test(pathname)
            ? 'public, max-age=31536000, immutable' : 'no-cache');
        createReadStream(target).on('error', () => response.destroy()).pipe(response);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Not found');
    }
});
const listen = () => new Promise(done => server.listen(0, '127.0.0.1', done));
const close = () => new Promise(done => server.close(done));
const wait = ms => new Promise(done => setTimeout(done, ms));
const captureMetrics = async cdp => {
    const rows = (await cdp.send('Performance.getMetrics')).metrics ?? [];
    const m = Object.fromEntries(rows.map(row => [row.name, row.value]));
    return {
        scriptDurationMs: m.ScriptDuration === undefined ? null : +(m.ScriptDuration * 1000).toFixed(2),
        v8CompileDurationMs: m.V8CompileDuration === undefined ? null : +(m.V8CompileDuration * 1000).toFixed(2),
        taskDurationMs: m.TaskDuration === undefined ? null : +(m.TaskDuration * 1000).toFixed(2),
        jsHeapUsedBytes: m.JSHeapUsedSize ?? null,
        jsHeapTotalBytes: m.JSHeapTotalSize ?? null,
        domNodes: m.Nodes ?? null,
    };
};
const delta = (before, after) => Object.fromEntries(Object.entries(after).map(([key, value]) =>
    [key, typeof value === 'number' && typeof before[key] === 'number'
        ? +Math.max(0, value - before[key]).toFixed(2) : null]));

mkdirSync(output, { recursive: true });
const report = {
    schemaVersion: 1, status: 'pending', buildSha: process.env.GITHUB_SHA ?? null,
    measuredAtUtc: new Date().toISOString(), profileName, profile,
    browser: null, platform: 'headless Chromium, emulated touchscreen and network/CPU, software GPU',
    physicalPhoneMeasured: false, gpuMemoryBytes: null, residentMemoryBytes: null,
    batteryDrain: null, thermalState: null, actualTouchToPhotonMs: null,
    limitations: [
        'CPU and network emulation approximate mobile conditions and vary across CI hosts.',
        'Network encodedDataLength is Chromium CDP transferred bytes; not the full hosting bandwidth bill.',
        'JS heap excludes native, decoded image, GPU and resident process memory.',
        'Frame intervals come from the existing game-render submission observer, not displayed frames.',
        'Touch measurement is event-to-render-submission, not real touch-to-photon latency.',
        'Advisory budgets are not enforced until comparable baselines and physical-device evidence exist.',
        'This scenario does not measure sustained battery use or thermal throttling; physical phones are required.',
    ],
    budgets: BUDGETS, inventory: inventoryRelease(release),
    coldMenu: null, warmMenu: null, games: [], errors: [], warnings: [],
};
let browser;
let context;
let page;
try {
    await listen();
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    report.browser = browser.version();
    context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.dpr, hasTouch: true, isMobile: true, reducedMotion: 'no-preference',
        serviceWorkers: 'block' });
    page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: profile.latencyMs,
        downloadThroughput: profile.downloadBytesPerSecond,
        uploadThroughput: Math.max(100_000, profile.downloadBytesPerSecond / 2),
        connectionType: 'cellular4g',
    });
    await page.addInitScript(() => {
        window.__demianMobileLab = { lcpMs: null, cls: 0 };
        try {
            new PerformanceObserver(list => {
                for (const item of list.getEntries()) window.__demianMobileLab.lcpMs = item.startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {}
        try {
            new PerformanceObserver(list => {
                for (const item of list.getEntries()) if (!item.hadRecentInput) window.__demianMobileLab.cls += item.value;
            }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
    });
    let phase = 'cold-menu';
    const inflight = new Map();
    const network = [];
    cdp.on('Network.requestWillBeSent', event => inflight.set(event.requestId, {
        url: event.request.url, phase, type: event.type ?? 'Other', encodedBytes: 0,
        status: null, fromCache: false,
    }));
    cdp.on('Network.requestServedFromCache', event => {
        const row = inflight.get(event.requestId);
        if (row) row.fromCache = true;
    });
    cdp.on('Network.responseReceived', event => {
        const row = inflight.get(event.requestId);
        if (!row) return;
        row.status = event.response.status;
        row.type = event.type ?? row.type;
        row.fromCache ||= Boolean(event.response.fromDiskCache || event.response.fromServiceWorker);
    });
    cdp.on('Network.loadingFinished', event => {
        const row = inflight.get(event.requestId);
        if (!row) return;
        row.encodedBytes = event.encodedDataLength ?? 0;
        network.push(row);
        inflight.delete(event.requestId);
    });
    cdp.on('Network.loadingFailed', event => {
        const row = inflight.get(event.requestId);
        if (!row) return;
        row.error = event.errorText ?? 'Unknown network error';
        network.push(row);
        inflight.delete(event.requestId);
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
        report.warnings.push('Failed request: ' + request.url().slice(0, 180));
    });
    const networkFor = selected => summarizeNetwork(network.filter(row => row.phase === selected));
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    const waitForMenu = () => page.waitForFunction(
        () => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 120_000 });
    const at = async selected => {
        phase = selected;
        await wait(200); // Drain async response events before snapshot.
        return networkFor(selected);
    };
    const bootStarted = nodePerformance.now();
    await page.goto(`${base}?deviceQa=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForMenu();
    const coldBootMs = Math.round(nodePerformance.now() - bootStarted);
    report.coldMenu = { bootMs: coldBootMs, network: await at('cold-menu'),
        browserMetrics: await captureMetrics(cdp),
        paint: await page.evaluate(() => window.__demianMobileLab),
        advisory: null };
    report.coldMenu.advisory = evaluateAdvisoryBudget({
        bootMs: coldBootMs, transferBytes: report.coldMenu.network.encodedTransferBytes });
    assert.ok(report.coldMenu.network.requestCount > 0, 'Cold network instrumentation produced no requests');

    for (const id of MOBILE_GAME_IDS) {
        phase = 'game:' + id;
        const beforeMetrics = await captureMetrics(cdp);
        const started = nodePerformance.now();
        try {
            await page.evaluate(async gameId => {
                await window.demianGameApplication.launchGame(gameId);
                return true;
            }, id);
            await page.waitForFunction(gameId => {
                const app = window.demianGameApplication;
                return app?.activeGameId === gameId && app.sessionState === 'playing';
            }, id, { timeout: 90_000 });
            const launchMs = Math.round(nodePerformance.now() - started);
            await page.evaluate(gameId => window.demianGameApplication.deviceQa.session.start({
                scenario: 'mobile-01:' + gameId, physicalPhone: false, renderer: 'game-submission',
            }), id);
            await page.waitForTimeout(1200);
            await page.touchscreen.tap(Math.round(profile.width / 2), Math.round(profile.height * .6));
            await page.waitForTimeout(650);
            const qa = await page.evaluate(() => {
                const app = window.demianGameApplication;
                app.deviceQa.sampleMemory();
                return app.deviceQa.session.stop();
            });
            await at(phase);
            const afterMetrics = await captureMetrics(cdp);
            const net = networkFor(phase);
            const row = { gameId: id, launchMs, measuredAtState: 'playing',
                render: qa, network: net, browserMetrics: afterMetrics,
                spriteCache: await page.evaluate(() => window.demianGameApplication.characterVisuals?.memorySnapshot() ?? null),
                metricDeltas: delta(beforeMetrics, afterMetrics), advisory: evaluateAdvisoryBudget({
                    renderP95: qa?.frameIntervalMs?.p95, targetFps: qa?.targetSegments?.[0]?.targetFps ?? 60,
                    touchP95: qa?.eventToRenderSubmissionMs?.p95,
                }) };
            if (!qa?.frameIntervalMs?.count) report.warnings.push(id + ': no render submissions in sampled window');
            report.games.push(row);
            console.log(`[mobile-01] ${id} launch ${launchMs}ms; frames ${qa?.frameIntervalMs?.count ?? 0}; transfer ${net.encodedTransferBytes}B`);
        } catch (error) {
            report.errors.push({ stage: phase, message: error.message });
            // Recover and collect data for remaining games rather than hiding later failures.
            try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 }); await waitForMenu(); }
            catch (recovery) { report.errors.push({ stage: 'recover:' + id, message: recovery.message }); break; }
        }
    }
    phase = 'warm-menu';
    const warmStarted = nodePerformance.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForMenu();
    report.warmMenu = {
        bootMs: Math.round(nodePerformance.now() - warmStarted),
        network: await at('warm-menu'), browserMetrics: await captureMetrics(cdp),
    };
    report.errors.push(...pageErrors.map(message => ({ stage: 'javascript', message })));
    report.status = report.errors.length || report.games.length !== MOBILE_GAME_IDS.length ? 'failed' : 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push({ stage: 'harness', message: error.stack ?? error.message });
} finally {
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, `mobile-${profileName}.json`), JSON.stringify(report, null, 2) + '\n');
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (server.listening) await close();
}
if (report.status !== 'passed') {
    console.error('[mobile-01] LAB FAILED:', report.errors);
    process.exitCode = 1;
} else {
    console.log('[mobile-01] LAB PASSED (lab evidence only). Report: ' +
        resolve(output, `mobile-${profileName}.json`));
}
