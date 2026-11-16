import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStaticTemplate } from '../../../tools/static_template.mjs';
import { shouldWarmOpenWorldPreview } from '../../../resources/js/game/shell/screens/GameSelectionScreen.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('canonical domain is consistent in HTML, Open Graph and VideoGame JSON-LD', () => {
    const html = renderStaticTemplate(read('../../../resources/views/demian.blade.php'), {
        entry: { file: 'assets/app.js', css: [] },
        publicOrigin: 'https://demiancafe.ir',
    });
    assert.match(html, /rel="canonical" href="https:\/\/demiancafe\.ir\/"/);
    assert.match(html, /property="og:url" content="https:\/\/demiancafe\.ir\/"/);
    const schema = JSON.parse(html.match(/id="demian-project-schema">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.url, 'https://demiancafe.ir/');
    assert.equal(schema['@id'], 'https://demiancafe.ir/#demian');
    assert.match(html, /src="build\/assets\/app\.js"/);
    assert.match(html, /name="demian-arcade-api" content=""/);
});

test('canonical origin rejects injection, ports, HTTP and non-root paths', () => {
    for (const publicOrigin of [
        'http://demiancafe.ir', 'https://demiancafe.ir/path',
        'https://demiancafe.ir:8443', 'https://bad..host',
        'https://evil.test"><script>alert(1)</script>',
    ]) {
        assert.throws(() => renderStaticTemplate('<head></head>', {
            entry: { file: 'app.js' }, publicOrigin,
        }), /bare HTTPS hostname/);
    }
});

test('cPanel production and staging examples are domain-isolated and prize-safe', () => {
    const prod = read('../../../ops/cpanel/.env.production.example');
    const staging = read('../../../ops/cpanel/.env.staging.example');
    assert.match(prod, /^APP_URL=https:\/\/api\.demiancafe\.ir$/m);
    assert.match(prod, /^DEMIAN_ARCADE_ALLOWED_ORIGINS=https:\/\/demiancafe\.ir$/m);
    assert.match(staging, /^APP_URL=https:\/\/api-staging\.demiancafe\.ir$/m);
    assert.match(staging, /^DEMIAN_ARCADE_ALLOWED_ORIGINS=https:\/\/staging\.demiancafe\.ir$/m);
    for (const env of [prod, staging]) {
        assert.match(env, /^APP_DEBUG=false$/m);
        assert.match(env, /^DEMIAN_ARCADE_API_ONLY=true$/m);
        assert.match(env, /^DEMIAN_OPEN_WORLD_ROUTE_PRIZES=false$/m);
    }
});

test('Open World preview warmup only runs with unrestricted foreground connectivity', () => {
    assert.equal(shouldWarmOpenWorldPreview({ deferBackground: false, reason: 'normal' }), true);
    for (const reason of ['limited-3g', 'save-data', 'slow-network', 'offline', 'hidden']) {
        assert.equal(shouldWarmOpenWorldPreview({ deferBackground: reason !== 'limited-3g', reason }), false);
    }
    assert.equal(shouldWarmOpenWorldPreview(null), false);
});

test('domain CNAME is opt-in and static host supports compression and safe caching', () => {
    const exporter = read('../../../tools/export_static.mjs');
    const workflow = read('../../../../.github/workflows/deploy-demian-pages.yml');
    const hosting = read('../../../tools/templates/static-host.htaccess');
    assert.match(exporter, /if \(pagesCustomDomain\) writeFileSync\(join\(out, 'CNAME'\)/);
    assert.match(workflow, /DEMIAN_PUBLIC_ORIGIN: https:\/\/demiancafe\.ir/);
    assert.match(hosting, /AddOutputFilterByType DEFLATE/);
    assert.match(hosting, /max-age=31536000, immutable/);
    assert.match(hosting, /max-age=300, stale-while-revalidate=3600/);
});
