import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStaticTemplate } from '../../../tools/static_template.mjs';
import { validatePwaRelease } from '../../../tools/validate_pwa_release.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('static template opts into PWA only for static release, never native Laravel routes', () => {
    const blade = read('../../../resources/views/demian.blade.php');
    assert.match(blade, /name="demian-static-release" content="false"/);
    const html = renderStaticTemplate(blade, { entry: { file: 'assets/app.js', css: ['assets/app.css'] } });
    assert.match(html, /name="demian-static-release" content="true"/);
    assert.match(html, /href="manifest.webmanifest"/);
    assert.doesNotMatch(html, /<meta http-equiv="Cache-Control"/);
});

test('PWA worker caches only offline fallback and icons; API and hashed bundles remain network controlled', () => {
    const sw = read('../../../tools/templates/service-worker.js');
    assert.match(sw, /request\.mode === 'navigate'/);
    assert.match(sw, /request\.headers\.has\('Authorization'\)/);
    assert.match(sw, /request\.credentials === 'include'/);
    assert.match(sw, /new Request\(request, \{ cache: 'no-store' \}\)/);
    assert.doesNotMatch(sw, /cache\.addAll\(\[.*build\//);
    assert.match(sw, /DEMIAN_ACTIVATE_UPDATE/);
    assert.match(sw, /offline\.html/);
});

test('boot error details are inserted inertly, not as executable HTML', () => {
    const source = read('../../../resources/js/app.js');
    assert.match(source, /detail\.textContent = error instanceof Error/);
    assert.match(source, /sceneContainer\.replaceChildren\(\)/);
    assert.doesNotMatch(source, /sceneContainer\.innerHTML\s*=\s*`/);
});

test('PWA validation rejects missing deployment files without accepting a local source directory', () => {
    assert.throws(() => validatePwaRelease(new URL('../../../tools/templates/', import.meta.url).pathname),
        /PWA hosting validation failed/);
});
