import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFLINE_GAME_IDS} from '../../../tools/offline_pack_manifest.mjs';
import {evaluatePr08Staging} from '../../../tools/qa/pr08_staging_policy.mjs';
const SHA='a'.repeat(40),PWA='b'.repeat(16),HASH='c'.repeat(64);
const api='https://api-staging.example.test',pwa='https://staging.example.test';
const opts={headSha:SHA,pwaReleaseId:PWA,stagingRunId:1234567,apiOrigin:api,
    pwaOrigin:pwa,mainProtected:true};
const input=()=>({
 receipt:{
    schema:1,kind:'demian-cpanel-staging-receipt',target:'staging',sourceSha:SHA,
    githubRunId:1234567,apiOrigin:api,pwaOrigin:pwa,archiveSha256:HASH,
    productionAuthorized:false,financialFeaturesActivated:false,
    hostSmokePassed:true,privatePathsVerified:true,pinnedSshHostUsed:true,
    releaseArchiveVerified:true,offsiteRestoreVerified:false,actualHost50VuAccepted:false,
 },
 pwaAudit:{
    schema:1,phase:11,status:'passed',commitSha:SHA,pwaReleaseId:PWA,
    bundleFingerprintSha256:HASH,checkedGames:[...OFFLINE_GAME_IDS],
    productionGoAuthorized:false,physicalDevicesVerified:false,
    productionHostVerified:false,
 },
 probe:{
    schema:1,phase:11,status:'passed-read-only-parity',target:'staging',
    sourceSha:SHA,pwaReleaseId:PWA,apiOrigin:api,pwaOrigin:pwa,
    tlsValidation:'default-strict',writeRequests:0,realDeviceAccepted:false,
    liveCapacityCertified:false,productionGoAuthorized:false,
    requestMethods:['GET','OPTIONS'],apiProbes:15,
    probes:['/','/service-worker.js','/offline-packs.json','/manifest.webmanifest']
        .map(path=>({path,status:200})),
 },
});
test('PR08 real staging read-only parity yields review required, never production GO',()=>{
 const result=evaluatePr08Staging(input(),opts);
 assert.equal(result.verdict,'STAGING_HTTP_PARITY_VERIFIED_OPERATOR_ACCEPTANCE_REQUIRED',result.blockers.join(','));
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.offsiteRestoreCertified,false);
 assert.equal(result.realDeviceCertified,false);
 assert.equal(result.financialFeaturesAuthorized,false);
});
test('PR08 refuses unprotected, cross-release, forged/prod and invalid network evidence',()=>{
 const attacks=[
  [x=>{x.receipt.target='production';}],
  [x=>{x.receipt.sourceSha='d'.repeat(40);}],
  [x=>{x.receipt.githubRunId=8;}],
  [x=>{x.receipt.archiveSha256='nohash';}],
  [x=>{x.receipt.productionAuthorized=true;}],
  [x=>{x.receipt.financialFeaturesActivated=true;}],
  [x=>{x.receipt.hostSmokePassed=false;}],
  [x=>{x.receipt.offsiteRestoreVerified=true;}],
  [x=>{x.pwaAudit.commitSha='d'.repeat(40);}],
  [x=>{x.pwaAudit.checkedGames.pop();}],
  [x=>{x.pwaAudit.pwaReleaseId='d'.repeat(16);}],
  [x=>{x.probe.status='failed';}],
  [x=>{x.probe.target='production';}],
  [x=>{x.probe.writeRequests=1;}],
  [x=>{x.probe.tlsValidation='insecure';}],
  [x=>{x.probe.probes.pop();}],
  [x=>{x.probe.apiProbes=1;}],
  [x=>{x.probe.realDeviceAccepted=true;}],
 ];
 attacks.forEach(([fn],i)=>{
  const source=input();fn(source);
  assert.equal(evaluatePr08Staging(source,opts).verdict,'NO_GO','attack '+i);
 });
 for(const mutations of [
    {mainProtected:false},{headSha:'d'.repeat(40)},
    {stagingRunId:999},{pwaReleaseId:'d'.repeat(16)},
    {apiOrigin:'https://api.example.test'},
    {pwaOrigin:'http://staging.example.test'},
 ]){
  assert.equal(evaluatePr08Staging(input(),{...opts,...mutations}).verdict,'NO_GO');
 }
});
