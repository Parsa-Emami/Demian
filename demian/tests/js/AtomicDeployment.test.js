import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '../..');
const src = path => readFileSync(resolve(root, path), 'utf8');
const games = ['OpenWorldGame','DinoRunGame','AfterHoursGame','CafeRushGame',
    'CafeCrittersGame','CoffeeCrashGame'];
const dirs = ['open-world','dino-run','after-hours','cafe-rush','cafe-critters','coffee-crash'];

function makeBuild({ missingGame = null, coalesced = false } = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'demian-lazy-build-'));
    mkdirSync(join(directory,'assets'), {recursive:true});
    writeFileSync(join(directory,'assets/app-deadbeef.js'), 'console.log("shell");');
    const manifest = {
        'resources/js/app.js': {file:'assets/app-deadbeef.js',isEntry:true, dynamicImports:[]},
    };
    for(let i=0;i<games.length;i++) {
        if (games[i] === missingGame) continue;
        const chunk = coalesced ? 'app-deadbeef.js' : games[i]+'-deadbeef.js';
        const key='resources/js/game/games/'+dirs[i]+'/'+games[i]+'.js';
        manifest[key] = {file:'assets/'+chunk,isDynamicEntry:true};
        if (!coalesced) writeFileSync(join(directory,'assets',chunk),'export default class '+games[i]+' {}');
        manifest['resources/js/app.js'].dynamicImports.push(key);
    }
    writeFileSync(join(directory,'manifest.json'), JSON.stringify(manifest,null,2));
    return directory;
}

test('production uses Vite 8 Rolldown lazy chunks without reintroducing Rollup config', () => {
    const config=src('vite.config.js');
    assert.match(config,/rolldownOptions\s*:/);
    assert.match(config,/codeSplitting\s*:\s*true/);
    assert.match(config,/strictExecutionOrder\s*:\s*true/);
    assert.doesNotMatch(config,/rollupOptions\s*:/);
});
test('GitHub Pages preserves old content-hashed chunks and validates full release before deploy',()=>{
    const workflow=src('../.github/workflows/deploy-demian-pages.yml');
    assert.match(workflow,/npm run validate:build/);
    assert.match(workflow,/retain_build_assets\.mjs/);
    assert.match(workflow,/demian-vite-asset-history/);
    assert.match(workflow,/check_lazy_game_chunks\.mjs/);
    assert.match(workflow,/actions\/upload-pages-artifact@v4/);
    assert.match(workflow,/actions\/deploy-pages@v4/);
});
test('stale-chunk recovery requires explicit action and never forces reload in ranked play',()=>{
    const blade=src('resources/views/demian.blade.php');
    assert.match(blade,/vite:preloadError/);
    assert.match(blade,/unhandledrejection/);
    assert.match(blade,/data-demian-chunk-recovery/);
    assert.match(blade,/reload\.addEventListener\('click'/);
    assert.doesNotMatch(blade,/location\.replace\(/);
    assert.match(blade,/data-runtime-version="14\.0\.0-mobile-runner"/);
    assert.match(blade,/data-deployment-mode="lazy-chunks"/);
});
test('missing character art remains playable using fallback canvas',()=>{
    const manager=src('resources/js/game/managers/CharacterManager.js');
    assert.match(manager,/createFallbackCharacterAssets/);
    assert.match(manager,/using the built-in pixel fallback/);
    assert.match(manager,/new THREE\.CanvasTexture\(canvas\)/);
});
test('build verifier accepts six distinct game chunks and rejects broken or atomic manifests',()=>{
    const valid=makeBuild();
    const incomplete=makeBuild({missingGame:'CoffeeCrashGame'});
    const atomic=makeBuild({coalesced:true});
    try {
        for(const [dir,ok] of [[valid,true],[incomplete,false],[atomic,false]]) {
            const result=spawnSync(process.execPath,[
                'tools/validate_build_bundle.mjs','--build-root',dir,
            ],{cwd:root,encoding:'utf8'});
            if (ok) assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
            else assert.notEqual(result.status,0,'incomplete/chunk-coalesced manifest must fail');
        }
    } finally {
        for(const dir of [valid,incomplete,atomic]) rmSync(dir,{recursive:true,force:true});
    }
});
test('initial entry leaves five game styles to selected dynamic import',()=>{
    const app=src('resources/js/app.js');
    const defs=src('resources/js/game/registry/GameDefinitions.js');
    for(const css of ['after-hours','cafe-rush','cafe-critters',
        'coffee-crash','phase5-step23-dino-run']) {
        assert.doesNotMatch(app,new RegExp("import ['\\\"]\\.\\./css/"+css+"\\.css"));
        assert.match(defs,new RegExp("css/"+css+"\\.css"));
    }
});
