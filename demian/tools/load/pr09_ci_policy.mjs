/**
 * Exact-SHA PR09 CI stress evidence. 100 HTTP clients in flight on a
 * disposable MySQL+PHP CLI development server; NEVER a cPanel capacity claim.
 * The 60/IP/min registration limit is part of this security contract.
 */
const SHA=/^[a-f0-9]{40}$/;
const obj=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const finite=(x,min,max=Number.MAX_SAFE_INTEGER)=>Number.isFinite(x)&&x>=min&&x<=max;
const clean=(v)=>obj(v)&&Array.isArray(v.failures)&&v.failures.length===0;
const budgets={50:{p95:2000,p99:4000,workers:8},100:{p95:4000,p99:8000,workers:16}};
export function evaluatePr09CiEvidence(data,{headSha,users=100}={}){
 const failures=[],budget=budgets[users];
 if(!budget||!SHA.test(headSha??''))failures.push('invalid_commit_or_test_size');
 if(!obj(data)||data.schema!==2||data.phase!=='PR09'||data.status!=='passed'
    ||!clean(data)||data.users!==users
    ||data.sourceSha!==headSha
    ||data.loadProfile!==users+'-inflight-http-clients'
    ||data.environment!=='disposable CI MySQL 8.4 / PHP CLI server / OPcache'
    ||data.physicalDeviceVerified!==false
    ||data.productionCapacityCertified!==false
    ||data.realHostCapacityVerified!==false
    ||data.independentSecurityAudit!==false
    ||data.noRealPrizeIssuance!==true||data.noProductionWrites!==true
    ||data.phpHttpWorkers!==budget?.workers
    ||data.maxObservedConnections!==null)
    failures.push('invalid_ci_run_claims');
 if(!finite(data?.maxInFlightRequests,users,1000)
    ||data?.verifiedRuns!==users
    ||data?.initialReplayAttempts!==2*users
    ||data?.duplicateReplayAttempts!==2*users)
    failures.push('100_concurrent_starts_and_replay_idempotency_unproven');
 if(!Array.isArray(data?.registrationBatches)
    ||data.registrationBatches.length!==Math.ceil(users/50)
    ||data.registrationBatches.some(x=>!obj(x)||x.clients<1||x.clients>50
        ||x.registrationIpLimitPreserved!==true)
    ||data.registrationBatches.reduce((n,x)=>n+x.clients,0)!==users)
    failures.push('registration_60_per_minute_limit_bypassed');
 for(const [name,count] of [
    ['register',users],['start',users],['complete',2*users],['duplicate',2*users],
    ['identity',users],['leaderboard',users]
 ]){
    const record=data?.timings?.[name];
    if(!obj(record)||record.count!==count
       ||!finite(record.p95Ms,0,30000)||!finite(record.p99Ms,0,30000)
       ||!finite(record.maxMs,0,30000)
       ||record.p99Ms<record.p95Ms||record.maxMs<record.p99Ms)
       failures.push('missing_or_invalid_'+name+'_latencies');
 }
 for(const group of ['identity','leaderboard']){
   if(!finite(data?.timings?.[group]?.p95Ms,0,budget?.p95??0)
       ||!finite(data?.timings?.[group]?.p99Ms,0,budget?.p99??0))
       failures.push('concurrent_'+group+'_slow_or_missing');
 }
 if(!finite(data?.timings?.complete?.p95Ms,0,budget?.p95??0)
    ||!finite(data?.timings?.complete?.p99Ms,0,budget?.p99??0))
    failures.push('server_replay_latency_exceeded_budget');
 const probes=[
    'missing bearer','forged bearer','cross-account completion',
    'impossible control mask','accelerated replay','bounded payload',
    'invalid rules','NAT peer remains eligible',
    'forged score ignored and racing initial submissions and idempotent duplicate receipts',
    'shared-cache rate limiting preserves unrelated café players',
    '100 authenticated identities isolated and weekly leaderboard safe under concurrency',
 ];
 if(!Array.isArray(data?.security)||data.security.length!==probes.length
    ||!probes.every(x=>data.security.some(y=>y?.name===x&&y.passed===true)))
    failures.push('authorization_replay_rate_limit_probes_missing');
 if(data?.integrity?.status!=='ok')failures.push('database_integrity_failed');
 return {
  schema:1,phase:'PR09',commitSha:SHA.test(headSha??'')?headSha:null,
  profile:users,ciVerdict:failures.length?'FAILED':'CI_READY',
  failures,
  securityAndReplayValidated:failures.length===0,
  productionCapacityCertified:false,
  cpanel100VuCertified:false,
  realCashierRaceCertified:false,
  productionAuthorized:false,
  financialFeaturesAuthorized:false,
  note:'CI 100 concurrent HTTP clients are not 100 concurrent hosted PHP workers or real hardware. Physical cPanel capacity and prize issuance remain human-approved NO_GO.',
 };
}
