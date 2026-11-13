import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '..');
const release = resolve(process.env.DEMIAN_QA_RELEASE_DIR ?? resolve(project, '_site'));
const out = resolve(process.env.DEMIAN_QA_REPORT_DIR ?? resolve(project, 'docs/p0-stability/browser'));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const prefix = '/relocated/demian/';
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (!url.pathname.startsWith(prefix)) throw Error('Outside relocation path');
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        const file = resolve(release, path.endsWith('/') || !path ? path + 'index.html' : path);
        if (!file.startsWith(release + '/')) throw Error('Outside release');
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const report = { physicalPhoneMeasured: false, mode: 'Headless Chromium; emulated dimensions; software rendering', profiles: [] };
try {
    browser = await chromium.launch({ headless: true, ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    report.browser = browser.version();
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
        const mobile = width < 1000;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        assert.equal(await page.locator('[data-device-qa]').count(), 0);
        assert.equal(await page.evaluate(() => Boolean(window.demianGameApplication.deviceQa)), false);
        await page.goto(`${base}?deviceQa=1`);
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        assert.equal(await page.evaluate(() => window.demianGameApplication.root.dataset.renderFps), '30',
            'idle menu should not render at full gameplay refresh rate');
        await page.locator('[data-device-qa] summary').click();
        await page.locator('[data-qa-device]').fill('Automated Chromium emulation');
        await page.locator('[data-qa-start]').click();
        await page.locator('[data-device-qa] summary').click();
        await page.evaluate(() => window.demianGameApplication.launchGame('coffee-crash'));
        await page.locator('[data-coffee-dialog-action="skip"]').click();
        const cell = page.locator('[data-coffee-cell="0"]');
        if (mobile) await cell.tap();
        else await cell.click();
        if (mobile) await page.waitForFunction(() => window.demianGameApplication.deviceQa.session.report().eventToRenderSubmissionMs.count > 0);
        await page.waitForFunction(() => window.demianGameApplication.deviceQa.session.report().frameIntervalMs.count >= 10);
        const metrics = await page.evaluate(() => window.demianGameApplication.deviceQa.session.report());
        assert.equal(metrics.physicalPhoneVerified, false);
        assert.ok(metrics.frameIntervalMs.max > 0);
        assert.ok(metrics.frameCpuWorkMs.count > 0, 'opt-in QA must record frame CPU work');
        assert.equal(metrics.physicalPhoneVerified, false);
        if (mobile) assert.ok(metrics.eventToRenderSubmissionMs.count > 0);
        else assert.equal(metrics.eventToRenderSubmissionMs.count, 0);
        await page.evaluate(() => window.demianGameApplication.pauseGame());
        assert.equal(await page.evaluate(() => window.demianGameApplication.runtime.frameRequest), null,
            'paused runtime must not keep scheduling requestAnimationFrame');
        const count = await page.evaluate(() => window.demianGameApplication.deviceQa.session.report().frameIntervalMs.count);
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        assert.equal(await page.evaluate(() => window.demianGameApplication.deviceQa.session.report().frameIntervalMs.count), count);
        await page.locator('[data-device-qa] summary').click();
        await page.locator('[data-qa-scenario]').fill('pause-resume');
        await page.locator('[data-qa-mark]').click();
        await page.locator('[data-qa-stop]').click();
        const downloadPromise = page.waitForEvent('download');
        await page.locator('[data-qa-download]').click();
        const download = await downloadPromise;
        const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
        assert.equal(downloaded.metadata.deviceLabel, 'Automated Chromium emulation');
        assert.ok(downloaded.markers.some(marker => marker.label === 'pause-resume'));
        assert.equal(downloaded.physicalPhoneVerified, false);
        await page.screenshot({ path: resolve(out, `qa-${width}x${height}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.evaluate(async () => {
            const app = window.demianGameApplication;
            await app.dispose();
            window.qaDisposed = !document.querySelector('[data-device-qa]') && !app.deviceQa.session.running;
        });
        assert.equal(await page.evaluate(() => window.qaDisposed), true);
        assert.deepEqual(errors, []);
        report.profiles.push({ width, height, optInOnly: true, captureAndDownload: 'passed', touchProxy: mobile ? 'passed' : 'excluded mouse',
            pauseExclusion: 'passed', cleanup: 'passed', metrics: downloaded, errors });
        await context.close();
    }
    report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally {
    await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2));
    await browser?.close();
    await new Promise(done => server.close(done));
}
