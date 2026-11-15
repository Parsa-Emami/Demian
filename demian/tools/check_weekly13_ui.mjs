/**
 * Step 13: end-to-end UI acceptance on the actual static build.
 * Headless Chromium device emulation, not a physical smartphone.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../_site');
if (!existsSync(resolve(root, 'index.html'))) throw Error('Run npm run build:static first');
const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\\') || pathname.split('/').includes('..')) throw Error('Unsafe path');
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
let context;
const code = 'DMC-' + 'A'.repeat(32);
const requests = [];
const apiBase = 'https://api.mock.test/api/v1/arcade';
try {
    context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2, hasTouch: true, isMobile: true,
        serviceWorkers: 'block',
    });
    await context.route('https://api.mock.test/**', async route => {
        const req = route.request();
        const url = new URL(req.url());
        requests.push({ path: url.pathname, query: url.search,
            auth: req.headers().authorization ?? null, method: req.method() });
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        };
        if (req.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        if (url.pathname.endsWith('/player/coupons')) {
            assert.equal(req.headers().authorization, 'Bearer ' + 'T'.repeat(64));
            await route.fulfill({ headers, json: { data: [
                { coupon_id: 1, source: 'weekly', game_id: '<img onerror=alert(1)>',
                    period_key: 'weekly:tehran:2026-11-07', prize_rank: 1,
                    discount_percent: 30, status: 'issued', code,
                    currency: 'IRR', min_order_minor: 1000,
                    max_discount_minor: 5000, expires_at: '2027-01-15T00:00:00Z' },
                { coupon_id: 2, source: 'weekly', game_id: 'dino-run',
                    period_key: 'weekly:tehran:2026-11-07', prize_rank: 2,
                    discount_percent: 20, status: 'redeemed',
                    code: 'DMC-' + 'B'.repeat(32), currency: 'IRR',
                    min_order_minor: 1000, max_discount_minor: 3000,
                    expires_at: '2027-01-15T00:00:00Z' },
            ] } });
            return;
        }
        if (url.pathname.endsWith('/games')) {
            await route.fulfill({ headers, json: { games: [
                { game_id: 'dino-run', ranked: true },
                { game_id: 'cafe-critters', ranked: false },
            ] } });
            return;
        }
        if (url.pathname.endsWith('/competition/leaderboard/weeks')) {
            await route.fulfill({ headers, json: { weeks: [
                { period_key: 'weekly:tehran:2026-11-14', week: '2026-11-14', status: 'current' },
                { period_key: 'weekly:tehran:2026-11-07', week: '2026-11-07', status: 'finalized' },
            ] } });
            return;
        }
        if (url.pathname.endsWith('/player/competition/leaderboard')) {
            assert.equal(req.headers().authorization, 'Bearer ' + 'T'.repeat(64));
            await route.fulfill({ headers, json: {
                my_rank: 27, participants: 27,
                my_best: { competition_points: 320, qualified: true,
                    source_game_id: 'dino-run' },
            } });
            return;
        }
        if (url.pathname.endsWith('/competition/leaderboard')) {
            const archived = url.searchParams.get('week') === '2026-11-07';
            await route.fulfill({ headers, json: {
                mode: 'online',
                period_key: 'weekly:tehran:' + (archived ? '2026-11-07' : '2026-11-14'),
                status: archived ? 'finalized' : 'live_preview',
                server_time: '2026-11-15T10:00:00+00:00',
                next_reset_at: archived
                    ? '2026-11-13T20:30:00+00:00' : '2026-11-20T20:30:00+00:00',
                is_current: !archived, participants: 27,
                data: [
                    { rank: 1, player_id: 'winner-1', display_name: '<script>alert(1)</script>',
                        competition_points: 1000, source_game_id: 'cafe-rush', qualified: true },
                    { rank: 2, player_id: 'winner-2', display_name: 'Tester',
                        competition_points: 947, source_game_id: 'dino-run', qualified: true },
                ],
            } });
            return;
        }
        await route.fulfill({ status: 404, headers, json: { error: 'Unknown mock API' } });
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/',
        { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() =>
        window.demianGameApplication?.sessionState === 'menu', null, { timeout: 120000 });
    await page.evaluate((url) => {
        const service = window.demianGameApplication.leaderboards;
        service.baseUrl = url;
        service.identity = { token: 'T'.repeat(64), player_id: 'owner-1' };
        service.accountKnown = true;
    }, apiBase);

    await page.locator('[data-shell-action="rewards"]').first().click();
    const wallet = page.locator('[data-screen="coupon-wallet"]');
    await wallet.locator('[data-wallet-list] > li').first().waitFor({ timeout: 15000 });
    assert.equal(await wallet.locator('[data-wallet-list] > li').count(), 2);
    assert.match(await wallet.locator('[data-wallet-status]').innerText(), /ایمیلی ارسال نمی‌شود/);
    assert.equal(await wallet.locator('[data-wallet-code]').count(), 1,
        'spent coupons must not display a code even when upstream returns one');
    assert.equal(await wallet.locator('[data-wallet-code]').inputValue(), code);
    assert.match(await wallet.locator('[data-wallet-list]').innerText(), /۳۰/);
    assert.equal(await wallet.locator('img').count(), 0);
    assert.equal(await page.evaluate((secret) =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)]
            .some(value => value.includes(secret)), code), false,
    'wallet code must not be persisted to storage');

    await wallet.locator('[data-shell-action="close-modal"]').click();
    await wallet.waitFor({ state: 'hidden' });
    assert.equal(await wallet.locator('[data-wallet-code]').count(), 0,
        'closed wallet must erase secrets from DOM');

    await page.locator('[data-shell-action="leaderboard"]').first().click();
    const leaderboard = page.locator('[data-screen="leaderboard"]');
    await leaderboard.locator('[data-ranking-rows] tr').first().waitFor({ timeout: 15000 });
    assert.equal(await leaderboard.locator('[data-ranking-game]').inputValue(), 'all-games');
    assert.match(await leaderboard.locator('[data-ranking-status]').innerText(), /موقت/);
    assert.match(await leaderboard.locator('[data-ranking-personal-best]').innerText(), /۲۷/);
    assert.match(await leaderboard.locator('[data-ranking-rows] tr').first().innerText(), /۱[٬\s]?۰۰۰/);
    assert.equal(await leaderboard.locator('script').count(), 0,
        'untrusted player names must remain text, not executable HTML');
    await leaderboard.locator('[data-ranking-week]').selectOption('2026-11-07');
    await page.waitForFunction(() =>
        document.querySelector('[data-ranking-status]')?.textContent.includes('آرشیوشده'),
        null, { timeout: 15000 });
    assert.match(await leaderboard.locator('[data-ranking-personal-best]').innerText(), /۳۲۰/);
    assert.equal(await leaderboard.locator('[data-ranking-countdown]').isHidden(), true);

    await page.setViewportSize({ width: 320, height: 568 });
    assert.equal(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth + 1), true,
    'narrow viewport must not create horizontal page overflow');
    assert.deepEqual(pageErrors, []);
    assert.equal(requests.filter(item => /mail|email|send-message/i.test(item.path)).length, 0);
    assert.ok(requests.some(item => item.path.endsWith('/player/coupons')
        && item.auth === 'Bearer ' + 'T'.repeat(64)));
    assert.ok(requests.some(item => item.path.endsWith('/competition/leaderboard')
        && !item.auth));
    assert.ok(requests.some(item => item.path.endsWith('/player/competition/leaderboard')
        && item.auth === 'Bearer ' + 'T'.repeat(64)));
    console.log('Step 13 browser UI: private in-app wallet, no email, 320px RTL, live and archived standings passed');
} finally {
    await context?.close();
    await browser.close();
    await new Promise(done => server.close(done));
}
