import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const workflow=read('../../../../.github/workflows/pr09-100-client-security-ci.yml');
const deploy=read('../../../../.github/workflows/cpanel-api-deploy.yml');
const protection=read('../../../ops/github/main_branch_protection.sh');
const harness=read('../../../tools/load/ci_http_acceptance.mjs');
const report=read('../../../tools/load/pr09_ci_verify.mjs');
test('PR09 100-client CI uses disposable PHP/MySQL, exact-SHA artifacts',()=>{
 for(const term of ['mysql:8.4',"php-version: '8.4'",
   "DEMIAN_CI_LOAD_USERS: '100'",'pr09_ci_verify.mjs',
   'pr09-100-security-${{ github.sha }}','http-100.json',
   "APP_ENV: testing","DB_DATABASE: demian_test","DB_HOST: 127.0.0.1",
   'pull_request:','push:']){
  assert.ok(workflow.includes(term),term);
 }
 assert.doesNotMatch(workflow,/ssh |scp |rsync |DEMIAN_COUPONS_ISSUE_ENABLED=true/);
 assert.doesNotMatch(workflow,/\n  deploy:/);
 assert.match(workflow,/permissions:\n  contents: read/);
 assert.match(report,/evaluatePr09CiEvidence/);
});
test('PR09 100-client preparation preserves 60/IP registration rate limit',()=>{
 assert.match(harness,/for \(let offset = 0; offset < users; offset \+= 50\)/);
 assert.match(harness,/delay\(62000\)/);
 assert.match(harness,/maxInFlightRequests>=users/);
 assert.match(harness,/verifiedRuns = starts.length/);
 assert.match(harness,/duplicateReplayAttempts = retries.length/);
 for(const term of ['forged bearer','cross-account completion','impossible control mask',
   'accelerated replay','NAT peer remains eligible'])assert.ok(harness.includes(term));
});
test('PR09 is required at exact main SHA before cPanel deploy can even package',()=>{
 assert.match(deploy,/PR09 isolated 100-client load and security acceptance \(CI only\)/);
 assert.match(deploy,/\.name == "load-100" and \.conclusion == "success"/);
 assert.match(deploy,/PR09 exact-SHA 100-client CI passed/);
 assert.match(protection,/load-100/);
});
