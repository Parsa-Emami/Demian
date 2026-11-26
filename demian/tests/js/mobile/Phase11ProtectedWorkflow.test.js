import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow=readFileSync(new URL('../../../../.github/workflows/phase11-controlled-go-no-go.yml',import.meta.url),'utf8');
const pages=readFileSync(new URL('../../../../.github/workflows/deploy-demian-pages.yml',import.meta.url),'utf8');
test('F11-14 protected GO/NO-GO candidate is main-only and cannot publish',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n  push:/);
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/DEMIAN_PHASE11_ACCEPTANCE_B64/);
 assert.match(workflow,/base64 -d/);
 assert.match(workflow,/phase11_release_policy\.mjs/);
 assert.doesNotMatch(workflow,/\[\[ -f demian\/ops\/phase11\/acceptance\.production\.json/);
 assert.match(workflow,/environment:\n      name: cpanel-production/);
 assert.match(workflow,/REVIEWED_FINAL_EVIDENCE_NO_P0/);
 assert.match(workflow,/release-qa/);
 assert.match(workflow,/phase11-pwa-bundle-/);
 assert.match(workflow,/actions\/download-artifact@v4/);
 assert.match(workflow,/data.pwaReleaseId!==process.env.INPUT_PWA/);
 assert.match(workflow,/head_sha == \$sha/);
 assert.match(workflow,/productionDeployed:false/);
 assert.match(workflow,/couponIssuanceEnabled:false/);
 assert.doesNotMatch(workflow,/scp |rsync |artisan migrate|actions\/deploy-pages/);
});

test('F11-14 ranked production PWA build is blocked unless a protected same-SHA review run succeeded',()=>{
 assert.match(pages,/Ranked main release requires protected Phase 11 decision on exact SHA/);
 assert.match(pages,/DEMIAN_PHASE11_APPROVAL_RUN_ID/);
 assert.match(pages,/vars.DEMIAN_ARCADE_ENABLE_RANKED == 'true'/);
 assert.match(pages,/Phase 11 protected GO \/ NO-GO candidate audit/);
 assert.match(pages,/head_sha == \$sha/);
 assert.match(pages,/protected-review/);
 assert.match(pages,/github.ref == 'refs\/heads\/main'/);
});
