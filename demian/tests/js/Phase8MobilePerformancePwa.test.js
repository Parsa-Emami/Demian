import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { buildOfflinePackManifest, OFFLINE_HASH_MAX_BYTES, OFFLINE_GAME_IDS } from '../../tools/offline_pack_manifest.mjs';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../../resources/js/game/characters/CharacterVisualContract.js';
import TouchQaTracker from '../../resources/js/game/performance/TouchQaTracker.js';
import { evaluateDeviceQaTargets } from '../../resources/js/game/performance/DeviceQaTargets.js';
import RuntimeSoakProfiler from '../../resources/js/game/performance/RuntimeSoakProfiler.js';
import { sendPwaMessage } from './helpers/PwaWorkerClient.js';
const read = path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sha = text=>createHash('sha256').update(text).digest('hex');
function fixture(t) {
    const root=mkdtempSync(join(tmpdir(),'demian-p8-'));
    t.after(()=>rmSync(root,{force:true,recursive:true}));
    const write=(path,text='sample')=>{
        const file=join(root,path);mkdirSync(dirname(file),{recursive:true});
        writeFileSync(file,text);return file;
    };
    for(const path of ['index.html','characters.json','manifest.webmanifest',
        'favicon.ico','icons/demian-192.png','icons/demian-512.png',
        'icons/demian-notification-badge.png','icons/demian-notification.png',
        'privacy/index.html','terms/index.html','competition-rules/index.html',
        'build/assets/app-test.js','build/assets/app-test.css','build/assets/font-a.woff2',
        'assets/characters/character-manifest-v4.json','assets/characters/master-motion-v1.json',
        'assets/companions/pishi/atlas.json', 'assets/companions/pishi/pishi.webp', 'assets/companions/pishi/portrait.webp',
        'assets/environments/cafe-runner-v1/wordmark.png','assets/environments/cafe-runner-v1/interior.webp',
        'assets/environments/demian-fbx/polished-v1/preview.webp',
        'assets/lobby/demian-at-dusk.webp', ...OFFLINE_GAME_IDS.map(id=>'assets/lobby/'+id+'.webp'),
        'assets/environments/demian-fbx/floorplan.webp',
        'assets/environments/demian-fbx/floorplan-detail.webp'])write(path);
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const version=characterPackVersion(slug),base='assets/characters/'+slug+'/'+slug;
        write(base+'-preview-v'+version+'.png');
        write(base+'-atlas-v'+version+'-lite.json');
        write(base+'-spritesheet-v'+version+'-lite.png');
    }
    return {root,write};
}
test('F8-01/02/07/09 PWA manifest hashes small executable assets, not large textures', t=>{
    const {root,write}=fixture(t);
    write('index.html','<!doctype html><title>Demian phase 8</title>');
    const manifest=buildOfflinePackManifest({
        release:root,entry:{file:'assets/app-test.js',css:['assets/app-test.css']},
        releaseId:'abcdef0123456789',
    });
    assert.deepEqual(manifest.games.map(x=>x.id),OFFLINE_GAME_IDS);
    assert.equal(manifest.release,'abcdef0123456789');
    const html=manifest.core.find(row=>row.path==='index.html');
    assert.equal(html.sha256,sha('<!doctype html><title>Demian phase 8</title>'));
    const js=manifest.core.find(row=>row.path==='build/assets/app-test.js');
    assert.match(js.sha256,/^[a-f0-9]{64}$/);
    const sprite=manifest.core.find(row=>row.path.endsWith('lite.png'));
    assert.equal(sprite.sha256,undefined,'no second decoded texture copy for hashing');
    const huge=Buffer.alloc(OFFLINE_HASH_MAX_BYTES+1,42);
    write('assets/environments/demian-fbx/floorplan-detail.webp',huge);
    const larger=buildOfflinePackManifest({
        release:root,entry:{file:'assets/app-test.js',css:['assets/app-test.css']},
        releaseId:'abcdef0123456789',
    });
    const large=larger.games.find(g=>g.id==='after-hours').files
        .find(row=>row.path.endsWith('floorplan-detail.webp'));
    assert.equal(large.bytes,OFFLINE_HASH_MAX_BYTES+1);
    assert.equal(large.sha256,undefined);
});
test('F8-03/04/06 touch tracker samples bounded high-frequency events; releases cancelled fingers',()=>{
    const tracker=new TouchQaTracker({moveThrottleMs:75});
    assert.equal(tracker.observe('pointerdown',4,0),true);
    assert.equal(tracker.observe('pointerdown',5,1),true);
    for(let i=1;i<=74;i++)assert.equal(tracker.observe('pointermove',4,i),false);
    assert.equal(tracker.observe('pointermove',4,75),true);
    assert.equal(tracker.observe('pointercancel',4,80),false);
    assert.equal(tracker.observe('pointerup',5,90),true);
    let r=tracker.snapshot();
    assert.equal(r.peakSimultaneousTouches,2);
    assert.equal(r.pointerCancels,1);
    assert.equal(r.activeTouches,0);
    assert.equal(r.sampledMoves,1);
    assert.equal(r.skippedHighFrequencyMoves,74);
    assert.equal(tracker.observe('pointerdown',6,100),true);
    tracker.boundary();
    r=tracker.snapshot();
    assert.equal(r.activeTouches,0);
    assert.equal(r.clearedAtLifecycle,1);
    tracker.reset();
    assert.equal(tracker.snapshot().pointerDowns,0);
});
test('F8-05/10/11/12 laboratory proxy cannot claim 60fps, physical heat or true touch-to-photon',()=>{
    const sample={
        activeGameplayMs:905000,frameIntervalMs:{count:80,p50:15,p95:18,p99:36},
        averageRenderedFps:58,targetSegments:[{targetFps:60,intervals:80}],
        jsHeap:{supported:true,samples:3,firstBytes:1000,lastBytes:1140},
    };
    const assessment=evaluateDeviceQaTargets(sample);
    assert.equal(assessment.productionCertified,false);
    assert.equal(assessment.physicalPhoneVerified,false);
    assert.equal(assessment.checks.fifteenMinutes.status,'observed');
    assert.equal(assessment.checks.frameP95.status,'within-target');
    assert.equal(assessment.checks.averageFps60.status,'within-target');
    assert.equal(assessment.checks.heapGrowth.status,'investigate');
    assert.equal(assessment.checks.touchToPhoton.status,'requires-physical-measurement');
    assert.equal(assessment.checks.thermalAndBattery.status,'requires-physical-measurement');
    const low={...sample,targetSegments:[{targetFps:30,intervals:80}]};
    assert.equal(evaluateDeviceQaTargets(low).checks.averageFps60.status,'insufficient-data');
    assert.equal(evaluateDeviceQaTargets(low).checks.frameP95.status,'insufficient-data');
    assert.equal(evaluateDeviceQaTargets({}).checks.heapGrowth.status,'unsupported');
});
test('F8-01/04 bounded soak reports p99 and memory growth without physical claims',()=>{
    let time=1000;
    const soak=new RuntimeSoakProfiler({now:()=>time});
    soak.start();
    for(let i=0;i<90;i++){time+=16;
        soak.frame(time,'dino-run');
        soak.work(i%10===0?22:4,'dino-run');
    }
    soak.sampleMemory({game:'dino-run',jsHeapBytes:10000,spriteCacheBytes:5000});
    time+=2000;
    soak.sampleMemory({game:'dino-run',jsHeapBytes:10900,spriteCacheBytes:5200});
    const report=soak.stop();
    assert.ok(report.windows[0].frameIntervals.p99Ms>=report.windows[0].frameIntervals.p95Ms);
    assert.equal(report.windows[0].jsHeap.growthPercent,9);
    assert.equal(report.windows[0].estimatedSpriteCache.growthPercent,4);
    assert.equal(report.physicalPhoneVerified,false);
    assert.ok(report.maxWindows<=60);
});
test('F8-08 rejects synchronous worker message faults with no hanging promise',async()=>{
    await assert.rejects(sendPwaMessage({postMessage(){throw new Error('worker replaced');}},
        {type:'DEMIAN_PACK_STATUS'},{timeoutMs:500}),/worker replaced/);
});
test('F8-09 SW checks SHA256 before putting any ready marker and keeps API out of caches',()=>{
    const sw=read('../../tools/templates/service-worker.js');
    const manifest=read('../../tools/offline_pack_manifest.mjs');
    const controller=read('../../resources/js/game/performance/PwaUpdateController.js');
    assert.match(sw,/verifyOfflineResource\(response, record\)/);
    assert.match(sw,/crypto\.subtle\.digest\('SHA-256'/);
    assert.match(sw,/response\.clone\(\)\.arrayBuffer/);
    assert.match(sw,/await caches\.delete\(cacheName\)/);
    assert.match(sw,/release: RELEASE_ID/);
    assert.match(sw,/request\.headers\.has\('Authorization'\)/);
    assert.match(manifest,/createHash\('sha256'\)/);
    assert.match(controller,/safeToReload/);
    assert.match(controller,/!app\?\.leaderboards\?\.pending/);
});
