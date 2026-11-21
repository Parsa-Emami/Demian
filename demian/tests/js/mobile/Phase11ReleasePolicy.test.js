import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePhase11Acceptance, requireReviewReady, PHASE11_GATES } from '../../../tools/qa/phase11_release_policy.mjs';
import { GAME_IDS } from '../../../tools/qa/step31_quality_policy.mjs';

const SHA='a'.repeat(40), PWA='b'.repeat(16), NOW=new Date('2026-11-21T12:00:00.000Z');
const date='2026-11-21T11:00:00Z';
const ev=n=>({url:'https://github.com/Parsa-Emami/Demian/issues/'+n,sha256:'f'.repeat(64),observedAt:date});
const device=(platform,tier,n)=>({
 platform,tier,physical:true,model:'Test physical device '+n,os:'OS 18',browser:platform==='ios'?'Safari 18':'Chrome 140',
 minutesPlayed:20,games:[...GAME_IDS],metrics:{touchLatencyP95Ms:60,memoryGrowthPct:5,frameTimeP95Ms:18,p50Fps:58},
 offlineReconnectPassed:true,rotationAndSafeAreaPassed:true,evidence:ev(n),
});
const sample=()=>({
 schema:1,environment:'production',recordedAt:date,releaseSha:SHA,pwaReleaseId:PWA,
 risks:{unresolvedP0:0,blockingP1:0,criticalSecurity:0,characterArtDebtAccepted:true,financialActivationDuringQa:false},
 checks:PHASE11_GATES.map((g,i)=>({
  id:g.id,status:'accepted',releaseSha:SHA,checkedAt:date,reviewedBy:'qaReviewer',
  evidence:[ev(i+100)],
 })),
 devices:[device('android','budget',1),device('android','midrange',2),device('ios','safari',3)],
 loadRuns:['read_only','account_write','verified_replay'].map((scenario,i)=>({
  scenario,origin:'staging',status:'metrics-within-budget',observedVus:50,
  durationMs:scenario==='read_only'?180000:20000,requestCount:500,
  p95Ms:800,p99Ms:1300,httpErrorRate:0.001,applicationErrorRate:0.001,
  productionHostCertified:false,evidence:ev(i+200),
 })),
 reviewers:Object.fromEntries(['engineering','security','operations','cafeOwner']
   .map((role,i)=>[role,{github:'reviewer'+i,approvedAt:date}])),
 cafePilot:{actualPlayers:true,playerCount:5,criticalProblemsClosed:true,evidence:ev(300)},
 operations:{realCpanelStaging:true,webAndCliPhp84:true,publicTlsAndCorsVerified:true,
  encryptedOffsiteBackupRestored:true,cronHeartbeatObserved:true,
  liveApiReleaseMatchesSha:true,rollbackRehearsedAgainstCompatibleSchema:true,
  realSmsVerified:true,cashierSingleUseVoucherTested:true,evidence:ev(301)},
});

test('F11-14 default evidence template is unambiguously NO_GO, not an auto-published release',()=>{
 const template=JSON.parse(readFileSync(new URL('../../../ops/phase11/acceptance.example.json',import.meta.url),'utf8'));
 const out=evaluatePhase11Acceptance(template,{headSha:SHA,pwaReleaseId:PWA,now:NOW});
 assert.equal(out.decision,'NO_GO');
 assert.equal(out.productionAuthorized,false);
 assert.equal(out.checks.length,13);
 assert.ok(out.blockers.includes('physical_ios_safari_unverified'));
 assert.throws(()=>requireReviewReady(template,{headSha:SHA,pwaReleaseId:PWA,now:NOW}),/NO_GO/);
});
test('F11-14 even fully claimed acceptance is REVIEW_REQUIRED, never autonomous GO',()=>{
 const out=evaluatePhase11Acceptance(sample(),{headSha:SHA,pwaReleaseId:PWA,now:NOW});
 assert.equal(out.decision,'HUMAN_REVIEW_REQUIRED',JSON.stringify(out.blockers));
 assert.equal(out.productionAuthorized,false);
 assert.equal(out.automaticDeploymentPermitted,false);
});
test('F11-14 missing/stale/duplicate/foreign SHA and unresolved risks fail closed',()=>{
 const changes=[
  m=>{m.releaseSha='c'.repeat(40);},
  m=>{m.pwaReleaseId='c'.repeat(16);},
  m=>{m.checks[0].status='blocked';},
  m=>{m.checks[0].evidence=[];},
  m=>{m.checks[0].releaseSha='c'.repeat(40);},
  m=>{m.checks.push({...m.checks[0]});},
  m=>{m.checks[2].evidence[0].url='https://example.com/fake';},
  m=>{m.risks.unresolvedP0=1;},
  m=>{m.risks.criticalSecurity=1;},
  m=>{m.risks.characterArtDebtAccepted=false;},
  m=>{m.risks.blockingP1=1;},
  m=>{m.devices[2].physical=false;},
  m=>{m.devices[0].minutesPlayed=0;},
  m=>{m.devices[1].metrics.touchLatencyP95Ms=1000;},
  m=>{m.devices[2].games=['dino-run'];},
  m=>{m.loadRuns[1].observedVus=12;},
  m=>{m.loadRuns[0].p99Ms=9000;},
  m=>{m.loadRuns[1].applicationErrorRate=0.5;},
  m=>{m.loadRuns[2].durationMs=0;},
  m=>{delete m.loadRuns[0].p95Ms;},
  m=>{m.reviewers.security.github=m.reviewers.engineering.github;},
  m=>{m.cafePilot.actualPlayers=false;},
  m=>{m.operations.encryptedOffsiteBackupRestored=false;},
  m=>{m.operations.realSmsVerified=false;},
  m=>{m.operations.cashierSingleUseVoucherTested=false;},
  m=>{m.recordedAt='2025-01-01T00:00:00Z';}
 ];
 for(const mutate of changes){
   const m=sample();mutate(m);
   assert.equal(evaluatePhase11Acceptance(m,{headSha:SHA,pwaReleaseId:PWA,now:NOW}).decision,
     'NO_GO',mutate.toString());
 }
});
