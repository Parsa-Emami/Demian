import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { mergeCompatibleAssets } from './compatible_build_assets.mjs';

const folder = mkdtempSync(join(tmpdir(), 'demian-chunk-rollover-'));
const old = join(folder, 'old'), newer = join(folder, 'new'), archive = join(folder, 'archive');
const write = (root, path, content) => {
    const target = join(root, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, content);
};
let active = old;
const server = createServer((req, res) => {
    try {
        const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
            .replace(/^\/+/, '') || 'index.html';
        const target = resolve(active, rel);
        if (!target.startsWith(active + sep) || !existsSync(target)
            || !statSync(target).isFile()) throw Error('not found');
        res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(target));
    } catch {
        res.statusCode = 404;
        res.end('not found');
    }
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = () => new Promise(resolve => server.close(resolve));
let browser;
try {
    write(old, 'index.html', '<html><script type="module" src="./build/assets/app-old.js"></script></html>');
    write(old, 'build/assets/app-old.js',
        "window.loadOldGame = async () => (await import('./game-old.js')).value;");
    write(old, 'build/assets/game-old.js', "export const value = 'old-game-still-works';");
    mergeCompatibleAssets({ release: old, releaseId: 'aaaaaaaaaaaaaaaa' });
    cpSync(join(old, 'build'), archive, { recursive: true });
    write(newer, 'index.html', '<html><script type="module" src="./build/assets/app-new.js"></script></html>');
    write(newer, 'build/assets/app-new.js',
        "window.loadNewGame = async () => (await import('./game-new.js')).value;");
    write(newer, 'build/assets/game-new.js', "export const value = 'new-game-works';");
    mergeCompatibleAssets({ release: newer, archive, releaseId: 'bbbbbbbbbbbbbbbb',
        requireArchive: true });
    await listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    await page.goto(base);
    await page.waitForFunction(() => typeof window.loadOldGame === 'function');
    active = newer;
    assert.equal(await page.evaluate(() => window.loadOldGame()), 'old-game-still-works');
    await page.reload();
    await page.waitForFunction(() => typeof window.loadNewGame === 'function');
    assert.equal(await page.evaluate(() => window.loadNewGame()), 'new-game-works');
    assert.deepEqual(errors, []);
    console.log('Chunk rollover: old browser tab and freshly loaded tab both work.');
} finally {
    await browser?.close();
    await close().catch(() => {});
    rmSync(folder, { recursive: true, force: true });
}
