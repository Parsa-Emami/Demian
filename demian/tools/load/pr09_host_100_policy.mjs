/**
 * Evaluate PRIVATE operator-provided k6 metrics from 100 host VUs.
 * Does not initiate traffic or attest host identity/provider approval.
 */
import { readFileSync,statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const profiles=Object.freeze({
 read_only:{minimumDurationMs:120000,minimumRequests:600,minimumIterations:100,p95Ms:1500,p99Ms:3000,custom:'demian_bad_responses'},
 verified_replay:{minimumDurationMs:1000,minimumRequests:200,minimumIterations:100,p95Ms:2000,p99Ms:4000,custom:'demian_verified_replay_errors'},
});
const finite=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function assessPr09Host100(k6,{target='staging',scenario='read_only',expectedVus=100}={}){
 if(target!=='staging'||expectedVus!==100||!profiles[scenario])
   throw Error('Only the explicitly authorized 100-VU STAGING profile is supported');
 const policy=profiles[scenario];
 const value=(metric,key)=>k6?.metrics?.[metric]?.values?.[key];
 const reported={
  configuredVus: value('vus_max','value')??value('vus_max','max'),
  observedVus:value('vus','max'),
  durationMs:k6?.state?.testRunDurationMs,
  requestCount:value('http_reqs','count'),
  iterations:value('iterations','count'),
  p95Ms:value('http_req_duration','p(95)'),
  p99Ms:value('http_req_duration','p(99)'),
  httpFailureRate:value('http_req_failed','rate'),
  checkPassRate:value('checks','rate'),
  applicationFailureRate:value(policy.custom,'rate'),
 };
 const checks={
  configured_100_vus:finite(reported.configuredVus,100,100),
  observed_100_vus:finite(reported.observedVus,100,100),
  sustained_duration:finite(reported.durationMs,policy.minimumDurationMs),
  requests:finite(reported.requestCount,policy.minimumRequests),
  iterations:finite(reported.iterations,policy.minimumIterations),
  p95_budget:finite(reported.p95Ms,0,policy.p95Ms),
  p99_budget:finite(reported.p99Ms,0,policy.p99Ms)&&reported.p99Ms>=reported.p95Ms,
  http_error_rate:finite(reported.httpFailureRate,0,0.01),
  app_error_rate:finite(reported.applicationFailureRate,0,0.01),
  response_contract:finite(reported.checkPassRate,0.99,1),
 };
 return {
  schema:1,phase:'PR09',scenario,profile:'100-VU-authorized-staging',
  metrics:reported,checks,
  status:Object.values(checks).every(Boolean)?'operator-metrics-within-budget':'NO_GO',
  physicalHostCapacityCertified:false,providerConsentIndependentlyVerified:false,
  offsiteRestoreCertified:false,phpFpmParityCertified:false,productionAuthorized:false,
  financialFeaturesAuthorized:false,
  note:'Operator JSON is self-asserted and is NOT authentic proof of cPanel hardware, provider capacity, host quotas, backup restore or prize security.',
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const pairs=Object.fromEntries(process.argv.slice(2).map(x=>{
    const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];
  }));
  if(pairs['--approval']!=='DEMIAN_PROVIDER_APPROVED_100_VU_STAGING'
     ||pairs['--target']!=='staging')
    throw Error('Explicit staging provider approval is required');
  const file=pairs['--input'];
  if(!file||statSync(file).size>1024*1024)throw Error('Missing or oversized k6 JSON');
  const report=assessPr09Host100(JSON.parse(readFileSync(file,'utf8')),
    {target:pairs['--target'],scenario:pairs['--scenario']});
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='operator-metrics-within-budget')process.exitCode=1;
 }catch(e){console.error('[PR09 HOST] NO_GO: '+e.message);process.exitCode=2;}
}
