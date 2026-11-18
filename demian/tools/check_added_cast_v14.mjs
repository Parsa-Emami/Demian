import assert from 'node:assert/strict';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { BUILTIN_CHARACTER_SLUGS } from '../resources/js/game/characters/CharacterVisualContract.js';

const root = resolve(import.meta.dirname, '../_site');
const cast = process.argv.slice(2);
assert.ok(cast.length > 0, 'Provide at least one character slug to check');
for (const slug of cast) assert.ok(BUILTIN_CHARACTER_SLUGS.includes(slug), `Unknown character: ${slug}`);
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer((request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw Error('Not found');
        response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
const results = [];
try {
    browser = await chromium.launch({
        headless: true,
        executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    for (const { width, height, mobile } of [
        { width: 390, height: 844, mobile: true },
        { width: 1440, height: 900, mobile: false },
    ]) {
        const context = await browser.newContext({
            viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
            isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
        });
        try {
            const page = await context.newPage();
            await page.bringToFront();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                const drawImage = CanvasRenderingContext2D.prototype.drawImage;
                window.castFrames = new Map();
                CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
                    const drawn = drawImage.call(this, image, ...args);
                    const app = window.demianGameApplication;
                    const avatar = app?.activeGame?.avatar;
                    if (args.length === 8 && app?.activeGameId === 'dino-run' && avatar?.texture?.image === image) {
                        const key = `${avatar.slug}:${avatar.state}`;
                        const frames = window.castFrames.get(key) ?? new Set();
                        frames.add(`${args[0]},${args[1]},${args[2]}`);
                        window.castFrames.set(key, frames);
                    }
                    return drawn;
                };
            });
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            for (const slug of cast) {
                await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu');
                const menu = page.locator('[data-screen="cafe-menu"]');
                await menu.locator(mobile ? '.cafe-menu__showcase' : '.menu-character-button').click();
                const card = page.locator(`[data-character-card="builtin-${slug}"]`);
                await card.scrollIntoViewIfNeeded();
                assert.match(await card.getAttribute('class'), /\bcharacter-card--portrait\b/);
                const image = card.locator('[data-character-preview][data-preview-state="ready"]');
                await image.waitFor();
                const pixels = await image.evaluate(canvas => {
                    const raw = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                    let count = 0;
                    for (let i = 3; i < raw.length; i += 4) if (raw[i] > 32) count++;
                    return count / (canvas.width * canvas.height);
                });
                assert.ok(pixels > .04, `${slug}: missing portrait artwork`);
                await card.locator('[data-select-character]').click();
                await page.waitForFunction(expected => window.demianGameApplication.characterVisuals.activeSlug === expected, slug);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForFunction(expected => {
                    const app = window.demianGameApplication;
                    return app?.sessionState === 'menu' && app.characterVisuals.activeSlug === expected;
                }, slug);
                const manager = page.locator('[data-character-manager]');
                if (await manager.getAttribute('data-sidebar-state') === 'expanded') await page.keyboard.press('Escape');
                await page.locator('[data-character-manager][data-sidebar-state="collapsed"]').waitFor();
                const checked = [];
                for (const game of ['dino-run', 'after-hours', 'cafe-rush', 'open-world']) {
                    console.log(`[Cast check] ${width}px · ${slug} · ${game}`);
                    await menu.getByRole('button', { name: 'انتخاب بازی', exact: true }).click();
                    await page.locator(`[data-game-launch="${game}"]`).click();
                    await page.waitForFunction(expected => {
                        const app = window.demianGameApplication;
                        const player = expected === 'open-world' ? app.characterManager?.activeEntity
                            : app.activeGame?.avatars?.player ?? app.activeGame?.avatar;
                        return app.activeGameId === expected && app.sessionState === 'playing' && Boolean(player?.atlas);
                    }, game);
                    const actual = await page.evaluate(id => {
                        const app = window.demianGameApplication;
                        const player = id === 'open-world' ? app.characterManager.activeEntity
                            : app.activeGame.avatars?.player ?? app.activeGame.avatar;
                        return id === 'open-world' ? {
                            slug: player.character.slug,
                            atlasVersion: player.atlas.meta.version,
                            clips: Object.keys(player.atlas.animations),
                        } : {
                            slug: player.slug,
                            atlasVersion: player.atlas.meta.version,
                            clips: Object.keys(player.atlas.animations),
                            art: player.texture.image.src,
                        };
                    }, game);
                    assert.equal(actual.slug, slug, game);
                    assert.equal(actual.atlasVersion, 14, game);
                    const requiredClips = ['idle', 'walk', 'run', 'sprint', 'turn', 'takeoff', 'jump', 'fall', 'land', 'slide', 'win'];
                    assert.ok(requiredClips.every(clip => actual.clips.includes(clip)), `${slug} in ${game}`);
                    if (game !== 'open-world') assert.ok(new URL(actual.art).pathname.includes(`/characters/${slug}/`), actual.art);
                    if (game === 'open-world') {
                        await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.grounded);
                        const sample = (state, previous) => page.waitForFunction(({ state, previous }) => {
                            const entity = window.demianGameApplication.characterManager.activeEntity;
                            const frame = entity.animator.currentFrameName();
                            return frame?.startsWith(state + '_') && frame !== previous && frame;
                        }, { state, previous }, { timeout: 8000 }).then(handle => handle.jsonValue());
                        await page.keyboard.down('d');
                        try {
                            const walk = await sample('walk', null);
                            await sample('walk', walk);
                            await page.keyboard.down('Shift');
                            const run = await sample('run', null);
                            await sample('run', run);
                        } finally {
                            await page.keyboard.up('Shift');
                            await page.keyboard.up('d');
                        }
                    }
                    if (game === 'dino-run') {
                        const start = page.getByRole('button', { name: 'شروع و پرش', exact: true });
                        await page.waitForFunction(() => {
                            const app = window.demianGameApplication;
                            return app.activeGame.model.status === 'ready' && !app.runtime.paused;
                        });
                        if (mobile) await start.tap();
                        else await start.click();
                        await page.waitForFunction(() => {
                            const model = window.demianGameApplication.activeGame.model;
                            return model.status === 'running' && model.time > .2;
                        });
                        await page.evaluate(() => {
                            const { model, run } = window.demianGameApplication.activeGame;
                            if (run.mode !== 'practice') throw Error('This check requires a device-only practice run');
                            model.spawnIn = 999;
                            model.obstacles = [];
                        });
                        await page.waitForFunction(() => {
                            const model = window.demianGameApplication.activeGame.model;
                            return model.y === 0 && model.vy === 0;
                        });
                        const sawMotion = state => page.waitForFunction(({ slug, state }) =>
                            (window.castFrames.get(`${slug}:${state}`)?.size ?? 0) >= 2, { slug, state }, { timeout: 8000 });
                        await sawMotion('run');
                        if (mobile) {
                            const touch = await context.newCDPSession(page);
                            for (const [selector, verify] of [
                                ['.runner-controls__jump', () => window.demianGameApplication.activeGame.model.y > 6],
                                ['.runner-controls__duck', () => window.demianGameApplication.activeGame.avatar.state === 'slide'],
                            ]) {
                                const button = page.locator(selector);
                                await button.waitFor({ state: 'visible', timeout: 8000 });
                                const box = await button.boundingBox();
                                assert.ok(box, selector);
                                await touch.send('Input.dispatchTouchEvent', {
                                    type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
                                });
                                await page.waitForFunction(verify);
                                await sawMotion(selector.endsWith('duck') ? 'slide' : 'jump');
                                await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                                await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
                            }
                            await touch.detach();
                        } else {
                            await page.keyboard.down('ArrowUp');
                            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y > 6);
                            await sawMotion('jump');
                            await page.keyboard.up('ArrowUp');
                            await page.waitForFunction(() => window.demianGameApplication.activeGame.model.y === 0);
                            await page.keyboard.down('ArrowDown');
                            await page.waitForFunction(() => window.demianGameApplication.activeGame.avatar.state === 'slide');
                            await sawMotion('slide');
                            await page.keyboard.up('ArrowDown');
                        }
                    }
                    await page.evaluate(() => window.demianGameApplication.exitGame());
                    checked.push(game);
                }
                results.push({ slug, width, height, mobile, checked });
            }
            assert.deepEqual(errors, []);
        } finally {
            await context.close();
        }
    }
    console.log(JSON.stringify({ browser: browser.version(), headless: true, physicalPhone: false, results }, null, 2));
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
}
