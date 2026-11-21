import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow=readFileSync(new URL('../../../../.github/workflows/phase11-controlled-go-no-go.yml',import.meta.url),'utf8');
test('F11-14 protected GO/NO-GO candidate is main-only and cannot publish',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n  push:/);
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/acceptance\.production\.json/);
 assert.match(workflow,/environment:\n      name: cpanel-production/);
 assert.match(workflow,/REVIEWED_FINAL_EVIDENCE_NO_P0/);
 assert.match(workflow,/release-qa/);
 assert.match(workflow,/head_sha == \$sha/);
 assert.match(workflow,/productionDeployed:false/);
 assert.match(workflow,/couponIssuanceEnabled:false/);
 assert.doesNotMatch(workflow,/scp |rsync |artisan migrate|actions\/deploy-pages/);
});
