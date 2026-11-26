import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({ options: {
    site: { type: 'string', default: '_site' },
    out: { type: 'string', default: 'docs/character-reference-v2/evidence' },
    sha: { type: 'string' },
} });
const site = resolve(values.site);
const output = resolve(values.out);
const viewport = { width: 390, height: 844 };
const characters = ['darya', 'arsal'];
const states = ['walk', 'run', 'jump', 'land'];
const limits = { visibleBodyRatio: [0.84, 1.16], airborneBodyRatio: [0.65, 1.16],
    footGapCssPx: 6, minimumTravelWorldUnits: 0.4 };
const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};

async function serve(request, response) {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
        const path = relative(site, file);
        if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path) || !(await stat(file)).isFile()) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
        createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
        response.writeHead(404).end();
    }
}

function observePlayer() {
    const game = window.demianGameApplication.activeGame;
    const renderer = game.context.renderer;
    const canvas = renderer.canvas;
    const ctx = renderer.bufferContext;
    const draw = ctx.drawImage;
    const imageBounds = new Map();
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const captured = { frames: [], screenshots: {} };
    window.referenceArtCapture = captured;

    ctx.drawImage = function (image, ...args) {
        draw.call(this, image, ...args);
        const actor = game.characterManager?.activeEntity;
        if (args.length !== 8 || !actor || image !== actor.texture?.image ||
            !['walk', 'run', 'jump', 'land'].includes(actor.state)) return;

        const [x, y, width, height, , destinationY, , destinationHeight] = args;
        const { image: file, imageRevision, variant } = actor.atlas.meta;
        const frame = [x, y, width, height];
        const key = [imageRevision, ...frame].join(':');
        if (!imageBounds.has(key)) {
            probe.canvas.width = width;
            probe.canvas.height = height;
            probe.drawImage(image, ...frame, 0, 0, width, height);
            const pixels = probe.getImageData(0, 0, width, height).data;
            let top = height, bottom = 0;
            for (let row = 0; row < height; row++) {
                for (let column = 0; column < width; column++) {
                    if (pixels[(row * width + column) * 4 + 3] > 32) {
                        top = Math.min(top, row);
                        bottom = Math.max(bottom, row + 1);
                    }
                }
            }
            imageBounds.set(key, { top, bottom });
        }
        const { top, bottom } = imageBounds.get(key);
        const transform = this.getTransform();
        const cssScale = canvas.getBoundingClientRect().height *
            renderer.presentationScale * transform.d / canvas.height;
        const visibleHeight = (bottom - top) * destinationHeight / height * cssScale;
        const pivotOffset = (destinationY + bottom * destinationHeight / height) * cssScale;
        captured.frames.push({
            state: actor.state, slug: actor.character.slug, grounded: actor.grounded,
            elevation: actor.bodyRoot.position.y, image: file, imageRevision, variant, frame,
            timeMs: performance.now(),
            visibleHeight, pivotOffset, lockedScale: actor.atlas.render.lockBodyScale,
            bodyRatio: (bottom - top) / height / actor.atlas.render.referenceBodyHeightRatio,
        });
        const state = actor.state;
        if (!Object.hasOwn(captured.screenshots, state)) {
            captured.screenshots[state] = null;
            queueMicrotask(() => { captured.screenshots[state] = canvas.toDataURL('image/png'); });
        }
    };
}

async function touchMovement(page) {
    const position = () => page.evaluate(() => {
        const { x, z } = window.demianGameApplication.characterManager.activeEntity.group.position;
        return { x, z };
    });
    const held = (state) => page.waitForFunction(expected =>
        window.referenceArtCapture.frames.some(frame => frame.state === expected), state);
    const point = async (selector, id) => {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box?.width && box.height, 'Visible touch control required: ' + selector);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
    };
    const client = await page.context().newCDPSession(page);
    const touch = (type, touchPoints = []) => client.send('Input.dispatchTouchEvent', { type, touchPoints });
    const stick = await point('[data-virtual-stick]', 1);
    const run = await point('[data-control-surface="world"] [data-input-hold="run"]', 2);
    const jump = await point('[data-control-surface="world"] [data-input-press="jump"]', 3);
    const travel = {};

    for (const state of ['walk', 'run']) {
        const start = await position();
        await touch('touchStart', [stick]);
        const distance = await page.evaluate(state => {
            const input = window.demianGameApplication.input;
            const deadZone = input.touchControls.touchDeadZone / 100;
            const sensitivity = input.touchControls.touchSensitivity / 100;
            const magnitude = state === 'run' ? 0.82 : 0.8;
            return input.touchStick.gesture.radius *
                (deadZone + (1 - deadZone) * Math.pow(magnitude, sensitivity));
        }, state);
        if (state === 'run') await touch('touchStart', [stick, run]);
        await touch('touchMove', [{ ...stick, x: stick.x + (state === 'walk' ? distance : -distance) },
            ...(state === 'run' ? [run] : [])]);
        await held(state);
        await page.waitForFunction(state => {
            const samples = window.referenceArtCapture.frames.filter(frame => frame.state === state);
            return samples.length > 1 && samples.at(-1).timeMs - samples[0].timeMs >= 850 &&
                new Set(samples.map(frame => frame.frame.join(','))).size >= 4;
        }, state);
        const finish = await position();
        travel[state] = Math.hypot(finish.x - start.x, finish.z - start.z);
        await touch('touchCancel');
        await page.waitForFunction(() => {
            const actor = window.demianGameApplication.characterManager.activeEntity;
            return actor.grounded && actor.speed() < .12 && actor.stateLock <= 0;
        });
    }

    await touch('touchStart', [jump]);
    await page.waitForFunction(() => !window.demianGameApplication.characterManager.activeEntity.grounded);
    await held('jump');
    await touch('touchEnd');
    await held('land');
    await page.waitForFunction(() => window.demianGameApplication.characterManager.activeEntity.stateLock <= 0);
    assert.equal(await page.evaluate(() => window.demianGameApplication.characterManager.activeEntity.grounded), true);
    return travel;
}

function summarize(frames, travel, slug) {
    return Object.fromEntries(states.map(state => {
        const observed = frames.filter(frame => frame.state === state);
        assert.ok(observed.length > 0, slug + '/' + state + ' did not draw');
        const ground = state !== 'jump';
        const ratios = observed.map(frame => frame.bodyRatio).sort((a, b) => a - b);
        const medianRatio = ratios[Math.floor(ratios.length / 2)];
        const [low, high] = ground ? limits.visibleBodyRatio : limits.airborneBodyRatio;
        const peakElevation = Math.max(...observed.map(frame => frame.elevation));
        const footGapCssPx = Math.max(...observed.map(frame => Math.abs(frame.pivotOffset)));
        const visibleHeights = observed.map(frame => frame.visibleHeight).sort((a, b) => a - b);
        assert.ok(observed.every(frame => frame.slug === slug && frame.lockedScale &&
            frame.grounded === ground && frame.image.startsWith(slug + '-spritesheet-')), slug + '/' + state);
        assert.ok(medianRatio >= low && medianRatio <= high, slug + '/' + state + ' body ratio ' + medianRatio);
        if (ground) assert.ok(peakElevation === 0 && footGapCssPx <= limits.footGapCssPx,
            slug + '/' + state + ' ground offset ' + footGapCssPx);
        else assert.ok(peakElevation > .35, slug + ' must leave the floor before landing');
        if (state in travel) assert.ok(travel[state] >= limits.minimumTravelWorldUnits,
            slug + '/' + state + ' did not travel enough to show a stride');
        return [state, { draws: observed.length, poses: new Set(observed.map(frame =>
            [frame.imageRevision, ...frame.frame].join(':'))).size,
            bodyRatioMedian: medianRatio, visibleHeightCssPxMedian: visibleHeights[Math.floor(visibleHeights.length / 2)],
            footGapCssPxMax: ground ? footGapCssPx : null, peakElevation, travel: travel[state] ?? null }];
    }));
}

async function recordCharacter(browser, url, slug, videoDir) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true,
        deviceScaleFactor: 2, serviceWorkers: 'block', recordVideo: { dir: videoDir, size: viewport } });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const video = page.video();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.demianGameApplication?.sessionState === 'menu', null, { timeout: 45000 });
        const menu = page.locator('[data-screen="cafe-menu"]');
        await menu.locator('.menu-character-button').tap();
        const card = page.locator('[data-character-card="builtin-' + slug + '"]');
        await card.scrollIntoViewIfNeeded();
        await card.locator('[data-character-preview][data-preview-state="ready"]').waitFor();
        await page.screenshot({ path: join(output, slug + '-picker.png') });
        await card.locator('[data-select-character]').tap();
        await page.waitForFunction(slug => window.demianGameApplication.characterVisuals.activeSlug === slug, slug);
        await page.waitForFunction(() => document.querySelector('[data-character-manager]').dataset.sidebarState === 'collapsed');
        await menu.getByRole('button', { name: 'انتخاب بازی', exact: true }).tap();
        await page.locator('[data-game-launch="open-world"]').tap();
        await page.waitForFunction(slug => {
            const app = window.demianGameApplication;
            const actor = app.characterManager?.activeEntity;
            return app.activeGameId === 'open-world' && app.sessionState === 'playing' &&
                actor?.character.slug === slug && actor.grounded && actor.stateLock <= 0 && actor.texture?.image?.width > 0;
        }, slug, { timeout: 45000 });
        await page.evaluate(() => window.demianGameApplication.activeGame.focusCharacter({ close: true }));
        assert.equal(await page.evaluate(() => document.documentElement.clientWidth), viewport.width);
        await page.screenshot({ path: join(output, slug + '-viewport.png') });
        await page.evaluate(observePlayer);
        const travel = await touchMovement(page);
        const { frames, screenshots } = await page.evaluate(() => window.referenceArtCapture);
        for (const state of states) {
            assert.ok(screenshots[state], slug + '/' + state + ' is missing its canvas capture');
            await writeFile(join(output, slug + '-' + state + '.png'), Buffer.from(screenshots[state].split(',')[1], 'base64'));
        }
        assert.deepEqual(errors, []);
        return {
            phases: summarize(frames, travel, slug),
            packs: [...new Map(frames.map(({ image, imageRevision, variant }) =>
                [imageRevision, { image, imageRevision, variant }])).values()],
            frames,
        };
    } catch (error) {
        await page.screenshot({ path: join(output, slug + '-failure.png') }).catch(() => {});
        const debug = await page.evaluate(() => {
            const app = window.demianGameApplication;
            const actor = app?.characterManager?.activeEntity;
            return { session: app?.sessionState, game: app?.activeGameId, state: actor?.state,
                position: actor?.group?.position, joystick: app?.input?.touchStick?.value,
                captured: window.referenceArtCapture?.frames?.slice(-15) };
        }).catch(() => null);
        await writeFile(join(output, slug + '-debug.json'), JSON.stringify(debug, null, 2) + '\n');
        throw new Error(slug + ': ' + error.message, { cause: error });
    } finally {
        await context.close();
        if (video) await video.saveAs(join(output, slug + '-390x844.webm'));
    }
}

const { release } = JSON.parse(await readFile(join(site, 'offline-packs.json'), 'utf8'));
assert.match(release, /^[0-9a-f]{16}$/);
if (values.sha) assert.match(values.sha, /^[0-9a-f]{40}$/);
await mkdir(output, { recursive: true });
const videoDir = await mkdtemp(join(tmpdir(), 'demian-reference-art-'));
const server = createServer(serve);
const report = { release, sourceSha: values.sha ?? null, status: 'running', viewport, deviceScaleFactor: 2,
    mode: 'Open World practice, emulated mobile touch', limits, characters: {} };
let browser;
try {
    await new Promise((accept, reject) => server.once('error', reject).listen(0, '127.0.0.1', accept));
    browser = await chromium.launch({
        headless: true,
        executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    report.browser = 'Chromium ' + browser.version();
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    for (const slug of characters) report.characters[slug] = await recordCharacter(browser, url, slug, videoDir);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    throw error;
} finally {
    await browser?.close();
    await rm(videoDir, { recursive: true, force: true });
    server.close();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log('Mobile reference art QA passed for Darya and Arsal, release ' + release);
