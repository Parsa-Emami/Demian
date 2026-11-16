/** Controlled build output comparison against the last atomic CI baseline. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const build = join(root, 'public/build');
const manifest = JSON.parse(readFileSync(join(build,'manifest.json'), 'utf8'));
const source = 'resources/js/app.js';
const files = new Set();
const visit = (key, seen = new Set()) => {
    if (seen.has(key)) return;
    seen.add(key);
    const row = manifest[key];
    assert.ok(row?.file, 'Missing eager import: ' + key);
    files.add(row.file);
    for (const css of row.css ?? []) files.add(css);
    for (const asset of row.assets ?? []) files.add(asset);
    for (const imported of row.imports ?? []) visit(imported,seen);
};
visit(source);
const gzip = path => gzipSync(readFileSync(join(build,path))).length;
const initial = [...files];
const js = initial.filter(name => name.endsWith('.js'));
const css = initial.filter(name => name.endsWith('.css'));
const baseline = {
    commit:'a4e1de798a5a8e0bc5736ffbc7cfdd032c95096a',
    bundleMode:'atomic',
    eagerJavaScriptGzipBytes:362160,
    eagerCssGzipBytes:55440,
    source:'successful pre-optimization Actions production build log; gzip outputs',
};
const current = {
    eagerJavaScriptGzipBytes:js.reduce((sum,name)=>sum+gzip(name),0),
    eagerCssGzipBytes:css.reduce((sum,name)=>sum+gzip(name),0),
    eagerJsFiles:js.length, eagerCssFiles:css.length,
    eagerJs:js.map(path=>({ path, gzipBytes:gzip(path) })),
    eagerCss:css.map(path=>({ path, gzipBytes:gzip(path) })),
};
const deltas = {
    jsGzipBytes:current.eagerJavaScriptGzipBytes - baseline.eagerJavaScriptGzipBytes,
    cssGzipBytes:current.eagerCssGzipBytes - baseline.eagerCssGzipBytes,
    jsReductionPct:+((1-current.eagerJavaScriptGzipBytes/baseline.eagerJavaScriptGzipBytes)*100).toFixed(1),
    cssReductionPct:+((1-current.eagerCssGzipBytes/baseline.eagerCssGzipBytes)*100).toFixed(1),
};
const result = {
    schemaVersion:1, status:'pending',
    scope:'initial manifest eager dependency graph, compressed transfer approximated by gzip sum',
    benchmarkType:'build artifact size comparison; not physical phone startup latency',
    baseline, current, deltas,
    gameChunks: Object.fromEntries([
        ['open-world','OpenWorldGame'], ['dino-run','DinoRunGame'],
        ['after-hours','AfterHoursGame'], ['cafe-rush','CafeRushGame'],
        ['cafe-critters','CafeCrittersGame'], ['coffee-crash','CoffeeCrashGame'],
    ].map(([name,klass])=>{
        const key = Object.keys(manifest).find(k=>k.endsWith('/'+klass+'.js'));
        const record = manifest[key];
        assert.ok(record?.isDynamicEntry && !files.has(record.file),
            'Not a real lazy chunk: '+name);
        return [name,{file:record.file,gzipBytes:gzip(record.file)}];
    })),
};
mkdirSync(join(root,'docs/startup-optimization'),{recursive:true});
try {
    assert.ok(current.eagerJavaScriptGzipBytes < baseline.eagerJavaScriptGzipBytes,
        'Lazy split failed to reduce initial JavaScript gzip bytes');
    assert.ok(current.eagerCssGzipBytes < baseline.eagerCssGzipBytes,
        'Game style split failed to reduce initial CSS gzip bytes');
    result.status = 'passed';
    console.log('Initial JS: '+current.eagerJavaScriptGzipBytes+' gzip bytes ('+deltas.jsReductionPct+'% smaller)');
    console.log('Initial CSS: '+current.eagerCssGzipBytes+' gzip bytes ('+deltas.cssReductionPct+'% smaller)');
} catch(error) {
    result.status='failed';
    result.failure=String(error.message ?? error);
    throw error;
} finally {
    writeFileSync(join(root,'docs/startup-optimization/bundle-comparison.json'),
        JSON.stringify(result,null,2)+'\n');
}
