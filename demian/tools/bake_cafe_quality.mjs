import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import CAFE_FBX from '../resources/js/game/shared/cafe/FbxCafeData.js';

const project = resolve(import.meta.dirname, '..');
const out = resolve(project, 'public/assets/environments/demian-fbx');
const { chromium } = await import(process.env.DEMIAN_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href : 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.gz': 'application/octet-stream' };
const server = createServer(async (request, response) => {
    try {
        const file = resolve(project, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
        if (!file.startsWith(`${project}/`)) throw new Error('Outside project');
        response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
    browser = await chromium.launch({ headless: true,
        ...(process.env.DEMIAN_BROWSER_EXECUTABLE ? { executablePath: process.env.DEMIAN_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/tools/fbx/quality.html`);
    await page.waitForFunction(() => window.sceneReady, null, { timeout: 120000 });
    const width = 2048, tileHeight = 1536, padding = 48;
    const bounds = CAFE_FBX.bounds;
    const density = width / (bounds.maxX - bounds.minX);
    const height = Math.round((bounds.maxZ - bounds.minZ) * density);
    const tiles = [];
    for (let y = 0; y < height; y += tileHeight) {
        const h = Math.min(tileHeight, height - y);
        const minZ = bounds.minZ + (y - padding) / density;
        const tile = await page.evaluate(input => window.bakeTile(input), {
            bounds: { minX: bounds.minX - padding / density, maxX: bounds.maxX + padding / density,
                minZ, maxZ: minZ + (h + padding * 2) / density },
            width: width + padding * 2, height: h + padding * 2,
        });
        if (errors.length) throw new Error(errors.join('\n'));
        const file = `quality-${y}.work.png`;
        await writeFile(resolve(out, file), Buffer.from(tile.image.split(',')[1], 'base64'));
        tiles.push({ file, y, height: h });
        console.log(`Cafe bake ${Math.min(y + h, height)}/${height}`);
    }
    await writeFile(resolve(out, 'quality.work.json'), JSON.stringify({
        sourceSha256: CAFE_FBX.sourceSha256, width, height, padding, tiles,
        renderer: 'Three.js WebGL / software SwiftShader', ambientOcclusion: 'GTAO', shadowMapSize: 2048,
    }, null, 2) + '\n');
} finally {
    await browser?.close();
    await new Promise(done => server.close(done));
}
