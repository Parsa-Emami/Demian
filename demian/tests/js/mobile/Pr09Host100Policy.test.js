import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessPr09Host100} from '../../../tools/load/pr09_host_100_policy.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const readonly=read('../../../tools/load/cpanel_100_active_staging.js');
const replay=read('../../../tools/load/cpanel_100_verified_replays_staging.js');
const fixtures=scenario=>({
 state:{testRunDurationMs:scenario==='read_only'?182000:60000},
 metrics:{
  vus_max:{values:{value:100}},
  vus:{values:{max:100}},iterations:{values:{count:900}},
  http_reqs:{values:{count:2700}},
  http_req_duration:{values:{'p(95)':850,'p(99)':1300}},
  http_req_failed:{values:{rate:0.002}},
  checks:{values:{rate:1}},
  demian_bad_responses:{values:{rate:0}},
  demian_verified_replay_errors:{values:{rate:0}},
 },
});
test('PR09 k6 read and verified replay accept metrics without falsely certifying host',()=>{
 for(const scenario of ['read_only','verified_replay']){
  const result=assessPr09Host100(fixtures(scenario),{scenario});
  assert.equal(result.status,'operator-metrics-within-budget',scenario);
  assert.equal(result.physicalHostCapacityCertified,false);
  assert.equal(result.productionAuthorized,false);
 }
});
test('PR09 100-VU policy refuses unverifiable low-quality or under-capacity reports',()=>{
 for(const kind of ['no99','lowConcurrency','short','errors','badBody','lowReq','underVus']){
  const z=fixtures('read_only');
  if(kind==='no99')delete z.metrics.http_req_duration.values['p(99)'];
  if(kind==='lowConcurrency')z.metrics.vus.values.max=99;
  if(kind==='short')z.state.testRunDurationMs=1000;
  if(kind==='errors')z.metrics.http_req_failed.values.rate=0.05;
  if(kind==='badBody')z.metrics.checks.values.rate=0.9;
  if(kind==='lowReq')z.metrics.http_reqs.values.count=10;
  if(kind==='underVus')z.metrics.vus_max.values.value=99;
  assert.equal(assessPr09Host100(z).status,'NO_GO',kind);
 }
 assert.throws(()=>assessPr09Host100(fixtures('read_only'),{target:'production'}));
 assert.throws(()=>assessPr09Host100(fixtures('read_only'),{expectedVus:50}));
});
test('PR09 k6 live traffic requires explicit owner and hosting provider approval',()=>{
 for(const source of [readonly,replay]){
  assert.match(source,/DEMIAN_LOAD_APPROVED/);
  assert.match(source,/DEMIAN_PROVIDER_100_VU_APPROVED/);
  assert.match(source,/DEMIAN_TARGET/);
  assert.match(source,/staging/);
  assert.match(source,/vus: 100/);
  assert.doesNotMatch(source,/http\.put\(|http\.patch\(/);
  assert.doesNotMatch(source,/console\.log\(.*token/);
 }
 assert.doesNotMatch(readonly,/http\.post\(|http\.del\(/);
 assert.doesNotMatch(replay,/http\.del\(|http\.put\(/);
 assert.match(replay,/DEMIAN_STAGING_IDENTITIES_FILE/);
 assert.match(replay,/idempotent verified replay/);
});
