/** Mobile-07: fail production builds with broken PWA or root-relative font URLs. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function validatePwaRelease(release) {
    const root = resolve(release);
    const failures = [];
    const read = path => {
        if (!existsSync(join(root, path))) {
            failures.push('Missing deployment file: ' + path);
            return '';
        }
        return readFileSync(join(root, path), 'utf8');
    };
    const html = read('index.html');
    const sw = read('service-worker.js');
    const offline = read('offline.html');
    const manifest = read('manifest.webmanifest');
    const packJson = read('offline-packs.json');
    read('.htaccess');
    if (!html.includes('name="demian-static-release" content="true"')) {
        failures.push('Static export PWA marker missing');
    }
    if (!html.includes('href="manifest.webmanifest"')) failures.push('Relative web manifest URL missing');
    if (!sw.includes('demian-offline-v1-') || sw.includes('__DEMIAN_RELEASE_ID__')) {
        failures.push('Service worker version missing or not rendered');
    }
    if (!sw.includes("event.request") || !sw.includes("request.mode === 'navigate'")) {
        failures.push('Missing navigation offline fallback strategy');
    }
    if (!offline.includes('دمیان فعلاً آفلاین است')) failures.push('Offline explanation missing');
    try {
        const packs = JSON.parse(packJson);
        const version = /const RELEASE_ID = '([a-f0-9]{16})'/.exec(sw)?.[1];
        if (!version || packs.release !== version || packs.schema !== 1 ||
            !Array.isArray(packs.core) || !Array.isArray(packs.games) ||
            packs.games.length !== 6 || packs.maxPackBytes > 96 * 1048576) {
            failures.push('Offline packs do not match the current bounded PWA release');
        } else {
            const all = [...packs.core, ...packs.games.flatMap(game => game.files ?? [])];
            for (const item of all) {
                if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(item.path ?? '') ||
                    item.path.includes('..') || /(^|\/)api(\/|$)/.test(item.path) ||
                    !existsSync(join(root, item.path)) ||
                    !Number.isSafeInteger(item.bytes) || item.bytes < 0) {
                    failures.push('Unsafe or missing offline pack asset: ' + String(item.path));
                    continue;
                }
            }
            for (const game of packs.games) {
                if (!/^(open-world|dino-run|after-hours|cafe-rush|cafe-critters|coffee-crash)$/.test(game.id) ||
                    game.totalBytes !== packs.coreBytes + game.bytes ||
                    game.totalBytes > packs.maxPackBytes) {
                    failures.push('Invalid offline game budget: ' + game.id);
                }
            }
        }
    } catch { failures.push('Invalid offline pack manifest JSON'); }

    try {
        const parsed = JSON.parse(manifest);
        if (parsed.start_url !== './' || parsed.scope !== './' || parsed.display !== 'standalone') {
            failures.push('PWA manifest is not portable to a nested origin path');
        }
        for (const icon of parsed.icons ?? []) {
            const path = String(icon.src);
            if (path.startsWith('/') || path.includes('..') || !existsSync(join(root, path))) {
                failures.push('PWA icon missing or nonportable: ' + path);
            }
        }
    } catch { failures.push('Invalid web manifest JSON'); }
    const cssFiles = existsSync(join(root, 'build/assets'))
        ? readdirSync(join(root, 'build/assets')).filter(name => name.endsWith('.css')) : [];
    let fontUrls = 0;
    for (const name of cssFiles) {
        const css = read('build/assets/' + name);
        for (const match of css.matchAll(/url\(\s*['"]?([^'")]+\.woff2(?:\?[^'")]+)?)['"]?\s*\)/g)) {
            const value = match[1];
            fontUrls++;
            if (value.startsWith('/')) {
                failures.push('Root-absolute CSS font URL (breaks subpaths): ' + value);
                continue;
            }
            const url = new URL(value, 'https://example.test/subpath/build/assets/' + name);
            if (!url.pathname.startsWith('/subpath/build/')) {
                failures.push('Escaping CSS font URL: ' + value);
                continue;
            }
            const resolvedFont = url.pathname.slice('/subpath/'.length);
            if (!existsSync(join(root, resolvedFont))) failures.push('Missing CSS font: ' + resolvedFont);
        }
    }
    if (fontUrls < 6) failures.push('Expected 6 locally bundled Vazirmatn WOFF2 references; found ' + fontUrls);
    if (failures.length) throw new Error('PWA hosting validation failed:\n' + failures.join('\n'));
    return { status: 'passed', fontUrls, cssFiles: cssFiles.length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
    const root = resolve(import.meta.dirname, '..', '_site');
    console.log('Mobile-07 PWA release validation', validatePwaRelease(root));
}
