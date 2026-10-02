// MIT. Current release validator. Historical phase validators remain separate.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { walk } from './validation/projectWalk.mjs';
import { GAME_CATALOG } from '../resources/js/game/catalog/GameCatalog.js';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(join(root,p),'utf8');
assert.deepEqual(GAME_CATALOG.map(g=>g.id),['open-world','dino-run']);
assert(GAME_CATALOG.every(g=>g.orientation==='any'));
const entries=JSON.parse(read('public/assets/characters/character-manifest-v4.json')).characters;
assert.deepEqual(entries.map(c=>c.slug).sort(),['darya','ronak','tiam']);
assert.equal(entries.find(c=>c.slug==='darya').pack_version,13);
assert.equal(JSON.parse(read('package.json')).version,'13.0.0');
assert.equal(read('FINAL-VERSION.txt').trim(),'13.0.0');
assert(read('resources/views/demian.blade.php').includes('data-runtime-version="13.0.0-mobile-runner"'));
const files=['resources/js','tests/js','tools'].flatMap(p=>walk(join(root,p),f=>['.js','.mjs'].includes(extname(f))));
for(const file of files){
    const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert.equal(check.status,0,file+': '+check.stderr);
    if(file.startsWith(join(root,'tools')))continue;
    const source=readFileSync(file,'utf8');
    const imports=[...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
    for(const [,specifier] of imports){
        if(!specifier.startsWith('.'))continue;
        const base=resolve(dirname(file),specifier);
        assert([base,base+'.js',base+'.mjs',base+'.json',join(base,'index.js')].some(existsSync),file+': missing '+specifier);
    }
}
console.log('Release 13 validation passed: '+files.length+' JS files, 2 games, 3 installed characters.');

