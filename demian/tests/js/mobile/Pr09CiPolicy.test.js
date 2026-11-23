import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePr09CiEvidence} from '../../../tools/load/pr09_ci_policy.mjs';
const SHA='a'.repeat(40);
function fixture(users=100){
 const timings=Object.fromEntries([['register',users],['start',users],
  ['complete',users*2],['duplicate',users*2]].map(([name,count])=>
  [name,{count,p95Ms:250,p99Ms:450,maxMs:550}]));
 return {
  schema:2,phase:'PR09',sourceSha:SHA,status:'passed',failures:[],
  environment:'disposable CI MySQL 8.4 / PHP CLI server / OPcache',
  loadProfile:users+'-inflight-http-clients',users,phpHttpWorkers:users===100?16:8,
  physicalDeviceVerified:false,productionCapacityCertified:false,
  independentSecurityAudit:false,realHostCapacityVerified:false,
  maxObservedConnections:null,noRealPrizeIssuance:true,noProductionWrites:true,
  registrationBatches:users===100?
    [{clients:50,registrationIpLimitPreserved:true},{clients:50,registrationIpLimitPreserved:true}]:
    [{clients:50,registrationIpLimitPreserved:true}],
  maxInFlightRequests:users,verifiedRuns:users,
  initialReplayAttempts:2*users,duplicateReplayAttempts:2*users,timings,
  integrity:{status:'ok'},
  security:[
    'missing bearer','forged bearer','cross-account completion',
    'impossible control mask','accelerated replay','bounded payload','invalid rules',
    'NAT peer remains eligible',
    'forged score ignored and racing initial submissions and idempotent duplicate receipts',
    'shared-cache rate limiting preserves unrelated café players',
  ].map(name=>({name,passed:true})),
 };
}
test('PR09 genuine 100-client CI report validates and never certifies production',()=>{
 const verdict=evaluatePr09CiEvidence(fixture(),{headSha:SHA,users:100});
 assert.equal(verdict.ciVerdict,'CI_READY',verdict.failures.join(','));
 assert.equal(verdict.productionAuthorized,false);
 assert.equal(verdict.cpanel100VuCertified,false);
 assert.equal(verdict.realCashierRaceCertified,false);
});
test('PR09 rejects forged, stale, incomplete or security-untrusted performance evidence',()=>{
 const attacks=[
  v=>{v.status='failed';},v=>{v.sourceSha='b'.repeat(40);},
  v=>{v.users=50;},v=>{v.verifiedRuns=99;},
  v=>{v.initialReplayAttempts=199;},v=>{v.duplicateReplayAttempts=199;},
  v=>{v.maxInFlightRequests=99;},v=>{v.maxObservedConnections=100;},
  v=>{v.phpHttpWorkers=100;},v=>{v.registrationBatches=[{clients:100,registrationIpLimitPreserved:true}];},
  v=>{v.registrationBatches[1].registrationIpLimitPreserved=false;},
  v=>{v.timings.complete.count=100;},v=>{v.timings.complete.p95Ms=5000;},
  v=>{v.timings.complete.p99Ms=9000;},
  v=>{v.timings.duplicate.p95Ms=NaN;},v=>{v.security.pop();},
  v=>{v.security[0].passed=false;},v=>{v.integrity.status='error';},
  v=>{v.noRealPrizeIssuance=false;},v=>{v.productionCapacityCertified=true;},
  v=>{v.realHostCapacityVerified=true;},v=>{v.failures.push('timed out');},
 ];
 attacks.forEach((fn,n)=>{
  const sample=fixture();fn(sample);
  assert.equal(evaluatePr09CiEvidence(sample,{headSha:SHA,users:100}).ciVerdict,'FAILED','case '+n);
 });
 assert.equal(evaluatePr09CiEvidence(fixture(),{headSha:'bad',users:100}).ciVerdict,'FAILED');
 const fifty=evaluatePr09CiEvidence(fixture(50),{headSha:SHA,users:50});
 assert.equal(fifty.ciVerdict,'CI_READY',fifty.failures.join(','));
});
