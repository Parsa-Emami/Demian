import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditPhase11StaticRelease } from '../../../tools/qa/phase11_release_audit.mjs';
import { OFFLINE_GAME_IDS } from '../../../tools/offline_pack_manifest.mjs';

const sha='a'.repeat(40), release='b'.repeat(16);
const create = () => {
    const temp=mkdtempSync(join(tmpdir(),'demian-phase11-bundle-'));
    const site=join(temp,'site'), source=join(temp,'source');
    mkdirSync(site, {recursive:true});
    mkdirSync(join(source,'resources/game'), {recursive:true});
    const sw="const RELEASE_ID = '"+release+"';\n";
    const files={
        '.htaccess':'Options -Indexes',
        'index.html':'<meta name="demian-static-release" content="true">',
        'manifest.webmanifest':'{"start_url":"./"}',
        'service-worker.js':sw,
        'offline-packs.json':JSON.stringify({schema:1,release,games:OFFLINE_GAME_IDS.map(id=>({id}))}),
        'offline.html':'Offline',
    };
    for(const [path, content] of Object.entries(files)) writeFileSync(join(site,path),content);
    writeFileSync(join(source,'resources/game/runner-rules.json'),JSON.stringify({version:'v1'}));
    return {temp,site,source,run:()=>auditPhase11StaticRelease({
        siteRoot:site,sourceRoot:source,commitSha:sha,
        validate:()=>({status:'passed'}),
    }),destroy:()=>rmSync(temp,{recursive:true,force:true})};
};
test('F11-13 emits exact immutable source and PWA asset provenance without claiming production readiness',()=>{
    const f=create();try{
        const out=f.run();
        assert.equal(out.status,'passed');
        assert.equal(out.commitSha,sha);
        assert.equal(out.pwaReleaseId,release);
        assert.equal(out.productionGoAuthorized,false);
        assert.equal(out.checkedGames.length,OFFLINE_GAME_IDS.length);
        assert.match(out.bundleFingerprintSha256,/^[a-f0-9]{64}$/);
    } finally {f.destroy();}
});
test('F11-13 changed release bytes change the fingerprint (no stale artifact reuse)',()=>{
    const f=create();try{
        const original=f.run().bundleFingerprintSha256;
        writeFileSync(join(f.site,'offline.html'),'Changed offline message');
        const next=f.run().bundleFingerprintSha256;
        assert.notEqual(original,next);
    } finally {f.destroy();}
});
test('F11-13 detects mismatched worker/pack IDs, missing files and wrong HEAD SHA',()=>{
    const f=create();try{
        writeFileSync(join(f.site,'service-worker.js'),"const RELEASE_ID = '0'.repeat(16)");
        assert.throws(f.run,/disagree/);
        writeFileSync(join(f.site,'service-worker.js'),"const RELEASE_ID = '"+release+"';");
        writeFileSync(join(f.site,'offline-packs.json'),JSON.stringify({schema:1,release,games:[]}));
        assert.throws(f.run,/catalog/);
        assert.throws(()=>auditPhase11StaticRelease({
            siteRoot:f.site,sourceRoot:f.source,commitSha:'short',
            validate:()=>({status:'passed'}),
        }),/40-character/);
    } finally {f.destroy();}
});
