import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPhase11Composite } from '../../../tools/qa/phase11_verify_ci.mjs';
import { OFFLINE_GAME_IDS } from '../../../tools/offline_pack_manifest.mjs';
const sha='a'.repeat(40),hash='c'.repeat(64),pwa='b'.repeat(16);
const files=Object.fromEntries(['.htaccess','index.html','manifest.webmanifest','service-worker.js','offline-packs.json','offline.html'].map(f=>[f,hash]));
const sample=()=>({
 schema:1,phase:11,status:'passed',commitSha:sha,pwaReleaseId:pwa,
 runnerRulesVersion:'v1',bundleFingerprintSha256:hash,criticalFileSha256:{...files},
 checkedGames:[...OFFLINE_GAME_IDS],artifactOrigin:'local-immutable-CI-export',
 physicalDevicesVerified:false,productionHostVerified:false,
 realRewardCycleVerified:false,productionGoAuthorized:false,
});
const opts={headSha:sha,buildResult:'success',backendResult:'success'};
test('F11-12/13 validates exact SHA and never authorizes a launch',()=>{
 const out=verifyPhase11Composite(sample(),opts);
 assert.equal(out.result,'CI_READY_PRODUCTION_NOT_AUTHORIZED');
 assert.equal(out.productionReady,false);
});
test('F11-12/13 rejects missing backend, forged hardware and invalid static hashes',()=>{
 const variants=[
  [m=>m.commitSha='d'.repeat(40),opts],
  [()=>{}, {...opts,backendResult:'failure'}],
  [()=>{}, {...opts,buildResult:'skipped'}],
  [m=>m.physicalDevicesVerified=true,opts],
  [m=>m.productionGoAuthorized=true,opts],
  [m=>m.checkedGames=['dino-run'],opts],
  [m=>m.criticalFileSha256['service-worker.js']=null,opts],
  [m=>m.bundleFingerprintSha256='bad',opts],
  [m=>m.pwaReleaseId='invalid',opts],
 ];
 for(const [update,config] of variants) {
  const fixture=sample();update(fixture);
  assert.throws(()=>verifyPhase11Composite(fixture,config),/required|failed/i);
 }
});
