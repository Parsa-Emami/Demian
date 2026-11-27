/**
 * Step 13: end-to-end UI acceptance on the actual static build.
 * Headless Chromium device emulation, not a physical smartphone.
 */
import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import policy from '../resources/legal/policy.json' with { type: 'json' };

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
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        };
        if (req.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        if (url.pathname.endsWith('/legal')) {
            await route.fulfill({ headers, json: { version: policy.version, require_contact: true } });
            return;
        }
        if (url.pathname.endsWith('/players') && req.method() === 'POST') {
            const body = req.postDataJSON();
            assert.equal(body.display_name, 'Browser Signup');
            assert.equal(body.contact_type, 'phone');
            assert.equal(body.contact_value, '۰۹۱۲۱۲۳۴۵۶۷');
            assert.equal(body.policy_version, policy.version);
            assert.ok(body.registration_key && body.accept_terms && body.privacy_acknowledged);
            assert.equal(Object.hasOwn(body, 'password'), false);
            await route.fulfill({ status: 201, headers, json: {
                player_id: 'new-browser-player', display_name: body.display_name, token: 'N'.repeat(64), has_contact: true,
            } });
            return;
        }
        if (url.pathname.endsWith('/competition/leagues')) {
            assert.equal(req.headers().authorization, undefined);
            assert.equal(url.searchParams.get('week'), '2026-11-07');
            const league = url.searchParams.get('league');
            await route.fulfill({ headers, json: {
                status: 'finalized', period_key: 'weekly:tehran:2026-11-07', participants: 1,
                data: [{ rank: 1, qualified: true, points: 900, display_name: 'League Player', recognition: league === 'gold' }],
            } });
            return;
        }
        if (url.pathname.endsWith('/player/competition/league')) {
            assert.equal(req.headers().authorization, 'Bearer ' + 'T'.repeat(64));
            await route.fulfill({ headers, json: {
                verified: true, current_league: 'gold', last_result: { league: 'gold', qualified: true, points: 900 },
            } });
            return;
        }
        if (url.pathname.endsWith('/player/progress')) {
            assert.equal(req.headers().authorization, 'Bearer ' + 'T'.repeat(64));
            const game = url.searchParams.get('game');
            assert.ok(['dino-run', 'cafe-drift'].includes(game));
            await route.fulfill({ headers, json: {
                verified: true, status: 'active', weeks: 4, personal_best: game === 'cafe-drift' ? 840 : 1050,
                next_goal: 1103, badges: 1, rules_version: game === 'cafe-drift' ? 'cafe-drift-replay-v1' : 'cafe-runner-v2',
                history: [{ period_key: 'weekly:tehran:2026-11-07', score: 1050, badge: 'personal-breakthrough' }],
            } });
            return;
        }
        if (url.pathname.endsWith('/player/loyalty')) {
            assert.equal(req.headers().authorization, 'Bearer ' + 'T'.repeat(64));
            await route.fulfill({ headers, json: {
                verified: true, status: 'active', total_xp: 820, level: 4, tier: 'regular', active_weeks: 6,
                next_tier: 'loyal', next_tier_xp: 1500, level_step_xp: 250, level_progress_xp: 70,
                history: [{ period_key: 'weekly:tehran:2026-11-07', total_xp: 130, participation_xp: 100,
                    variety_xp: 0, progress_xp: 0, continuity_xp: 0, mission_xp: 30 }],
            } });
            return;
        }
        if (url.pathname.endsWith('/player/missions')) {
            assert.equal(req.headers().authorization, 'Bearer ' + 'T'.repeat(64));
            await route.fulfill({ headers, json: {
                verified: true, status: 'provisional', today_complete: true,
                progress: { active_days: 3, distinct_games: 1, total_xp: 30 },
                played_games: ['cafe-drift'], last_finalized: { total_xp: 20 },
                server_now: '2026-11-15T10:00:00Z', day_ends_at: '2026-11-15T20:30:00Z', week_ends_at: '2026-11-20T20:30:00Z',
                targets: [{ game_id: 'cafe-drift', score: 840, target: 825, provisional_met: true }],
            } });
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
    assert.equal(await wallet.locator('[data-wallet-list] > li').count(), 1);
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

    const leagues = leaderboard.locator('[data-skill-league]');
    await leagues.locator('summary').click();
    await leagues.locator('li').first().waitFor();
    await leagues.locator('select').selectOption('gold');
    await leagues.getByText(/نشان افتخار/).waitFor();
    assert.match(await leagues.innerText(), /سطح شروع هفته.*طلا/);

    assert.equal(requests.some(({ path }) => /\/player\/(progress|loyalty|missions)$/.test(path)), false);
    const progress = leaderboard.locator('[data-personal-progress]');
    await progress.locator('summary').click();
    await progress.locator('meter').waitFor();
    assert.equal(await progress.locator('meter').evaluate(meter => meter.value), 1050);
    await progress.locator('select').selectOption('cafe-drift');
    await progress.getByText(/cafe-drift-replay-v1/).waitFor();
    const loyalty = leaderboard.locator('[data-loyalty-xp]');
    await loyalty.locator('summary').click();
    await loyalty.getByText(/مأموریت ۳۰/).waitFor();
    const missions = leaderboard.locator('[data-missions]');
    await missions.locator('summary').click();
    await missions.getByText(/موقتاً محقق شده/).waitFor();
    assert.match(await missions.innerText(), /تا پایان روز/);

    await page.setViewportSize({ width: 320, height: 568 });
    assert.equal(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth + 1), true,
    'narrow viewport must not create horizontal page overflow');
    await page.evaluate(() => {
        const service = window.demianGameApplication.leaderboards;
        service.identity = null;
        service.accountKnown = false;
        window.testSignup = service.ensureIdentity().then(result => result.player_id);
    });
    const signup = page.locator('[data-demian-legal-consent]');
    await signup.locator('input[name="display_name"]').fill('Browser Signup');
    await signup.locator('input[type="tel"]').fill('۰۹۱۲۱۲۳۴۵۶۷');
    await signup.locator('[data-legal-terms]').check();
    await signup.locator('[data-legal-privacy]').check();
    await signup.locator('[data-legal-confirm]').click();
    assert.equal(await page.evaluate(() => window.testSignup), 'new-browser-player');
    await leaderboard.locator('[data-shell-action="close-modal"]').click();
    await leaderboard.waitFor({ state: 'hidden' });
    assert.equal(await leaderboard.locator('[data-personal-progress] meter, [data-loyalty-xp] li, [data-missions] li').count(), 0);
    assert.deepEqual(pageErrors, []);
    assert.equal(requests.filter(item => /mail|email|send-message/i.test(item.path)).length, 0);
    assert.ok(requests.some(item => item.path.endsWith('/player/coupons')
        && item.auth === 'Bearer ' + 'T'.repeat(64)));
    assert.ok(requests.some(item => item.path.endsWith('/competition/leaderboard')
        && !item.auth));
    assert.ok(requests.some(item => item.path.endsWith('/player/competition/leaderboard')
        && item.auth === 'Bearer ' + 'T'.repeat(64)));
    console.log('Browser UI: phone signup, private wallet, leagues, progress, XP, and missions passed at 390px and 320px.');
} finally {
    await context?.close();
    await browser.close();
    await new Promise(done => server.close(done));
}
