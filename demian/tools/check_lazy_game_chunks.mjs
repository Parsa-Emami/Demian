/** Browser gate: no game JS/CSS before user selection, no missing late chunks. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../_site');
const reportRoot = resolve(import.meta.dirname, '../docs/startup-optimization');
mkdirSync(reportRoot, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(root, 'build/manifest.json'), 'utf8'));
const map = {
    'dino-run': ['resources/js/game/games/dino-run/DinoRunGame.js', 'resources/css/phase5-step23-dino-run.css'],
    'after-hours': ['resources/js/game/games/after-hours/AfterHoursGame.js', 'resources/css/after-hours.css'],
    'cafe-rush': ['resources/js/game/games/cafe-rush/CafeRushGame.js', 'resources/css/cafe-rush.css'],
    'cafe-critters': ['resources/js/game/games/cafe-critters/CafeCrittersGame.js', 'resources/css/cafe-critters.css'],
    'coffee-crash': ['resources/js/game/games/coffee-crash/CoffeeCrashGame.js', 'resources/css/coffee-crash.css'],
    'open-world': ['resources/js/game/games/open-world/OpenWorldGame.js', null],
};
const chunks = Object.fromEntries(Object.entries(map).map(([game, [src, css]]) => {
    assert.ok(manifest[src]?.isDynamicEntry, 'Missing dynamic game: ' + src);
    if (css) assert.ok(manifest[css]?.file, 'Missing dynamic game CSS: ' + css);
    return [game, {
        js: '/build/' + manifest[src].file,
        css: css ? '/build/' + manifest[css].file : null,
    }];
}));
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
    '.json':'application/json', '.woff2':'font/woff2', '.webp':'image/webp',
    '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('unsafe');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', /\.(js|css|woff2)$/.test(pathname) ?
            'public, max-age=31536000, immutable' : 'no-cache, max-age=0, must-revalidate');
        createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
});
const report = { status: 'pending', physicalDeviceVerified: false,
    coldMenuRequests: 0, eagerGameChunks: [], eagerGameStyles: [],
    loadedAfterSelection: {}, warmMenuMs: null, errors: [], limitations: [
        'Headless Chromium is not a physical Android/iOS device.',
        'Serving this artifact on localhost does not measure real CDN response times.',
    ] };
let browser;
try {
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
        ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({ headless:true,
        args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
    const context = await browser.newContext({ viewport:{width:390,height:844},
        deviceScaleFactor:2, hasTouch:true, isMobile:true, serviceWorkers:'block' });
    const page = await context.newPage();
    const requested = [];
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    page.on('pageerror', error => report.errors.push(error.message));
    const origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin + '/', { waitUntil:'domcontentloaded', timeout:60000 });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu',
        null,{timeout:30000});
    report.coldMenuRequests = requested.length;
    for (const [id, entry] of Object.entries(chunks)) {
        if (requested.includes(entry.js)) report.eagerGameChunks.push(id);
        if (entry.css && requested.includes(entry.css)) report.eagerGameStyles.push(id);
    }
    assert.deepEqual(report.eagerGameChunks, [], 'Game code requested before user intent.');
    assert.deepEqual(report.eagerGameStyles, [], 'Game CSS requested before user intent.');
    for (const id of ['dino-run', 'cafe-rush', 'coffee-crash']) {
        await page.evaluate(id => window.demianGameApplication.launchGame(id), id);
        await page.waitForFunction(id => window.demianGameApplication?.activeGameId === id &&
            window.demianGameApplication.sessionState === 'playing', id, { timeout:45000 });
        assert.ok(requested.includes(chunks[id].js), 'Game chunk not fetched: ' + id);
        if (chunks[id].css) assert.ok(requested.includes(chunks[id].css), 'Game CSS not fetched: ' + id);
        const others = Object.keys(chunks).filter(game => game !== id &&
            !['dino-run', 'cafe-rush', 'coffee-crash'].slice(0, ['dino-run', 'cafe-rush', 'coffee-crash'].indexOf(id)+1).includes(game));
        for (const other of others) {
            assert.equal(requested.includes(chunks[other].js), false,
                'Unselected game eagerly downloaded: ' + other);
        }
        report.loadedAfterSelection[id] = true;
        await page.evaluate(() => window.demianGameApplication.showMenu());
    }
    const begun = Date.now();
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
    report.warmMenuMs = Date.now() - begun;
    assert.deepEqual(report.errors, [], 'Runtime console exceptions');
    report.status = 'passed';
    await context.close();
    console.log('Lazy module + CSS user-intent QA: PASSED');
} catch (error) {
    report.status = 'failed';
    report.error = String(error.stack || error);
    console.error(report.error);
    throw error;
} finally {
    writeFileSync(resolve(reportRoot, 'lazy-chunks-browser.json'),
        JSON.stringify(report, null, 2)+'\n');
    await browser?.close();
    await new Promise(done => server.close(done));
}
