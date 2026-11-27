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

test('actionable PWA update belongs to a bounded scroll host, not a body overlay', () => {
    const css = read('../../../resources/css/pwa-update.css');
    const controller = read('../../../resources/js/game/performance/PwaUpdateController.js');
    assert.match(css, /position:\s*static/);
    assert.match(css, /z-index:\s*auto/);
    assert.doesNotMatch(css, /position:\s*(fixed|absolute)/);
    assert.match(css, /\.demian-pwa-update button\s*\{[^}]*pointer-events:\s*auto/s);
    assert.match(controller, /host\.append\(toast\)/);
    assert.doesNotMatch(controller, /documentRef\.body\.append\(toast\)/);
    assert.match(controller, /!safeToReload\(\) \|\| !registration\.waiting \|\| accepted/);
    assert.match(controller, /closest\('\[hidden\], \[inert\], \[aria-hidden="true"\]'\)/);
    assert.match(controller, /registration\.waiting\.postMessage\(\{ type: 'DEMIAN_ACTIVATE_UPDATE' \}\)/);
    assert.match(controller, /app\?\.sessionState === 'menu'/);
    for (const path of ['../../../resources/views/demian.blade.php', '../../../../playable/index.html']) {
        const html = read(path);
        assert.match(html, /<div data-pwa-update-host><\/div>/);
        assert.match(html, /updateHost\.append\(node\)/);
        assert.match(html, /z-index:var\(--z-local-sticky\)/);
    }
});

test('global passive notification contract cannot capture clicks through descendants', () => {
    const layers = read('../../../resources/css/layers.css');
    assert.match(layers, /\[data-ui-notice="passive"\][^\n]*\.arcade-toast[^\n]*\.shell-network-status\) \*/);
    assert.match(layers, /pointer-events: none !important/);
    const character = read('../../../resources/js/ui/CharacterManagerUI.js');
    assert.match(character, /assignUiLayer\(toast, UI_LAYER\.TOAST\)/);
    assert.match(character, /toast\.dataset\.uiNotice = 'passive'/);
});
