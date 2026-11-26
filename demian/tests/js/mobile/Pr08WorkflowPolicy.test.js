import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const stage=get('../../../../.github/workflows/pr08-staging-acceptance.yml');
const canonical=get('../../../../.github/workflows/cpanel-api-deploy.yml');
const legacy=get('../../../../.github/workflows/mobile11-api-deploy.yml');
const deploy=get('../../../ops/cpanel/deploy.sh');
const preflight=get('../../../ops/cpanel/host_preflight.php');
test('PR08 acceptance has protected main, exact SHA and no write endpoints',()=>{
 for(const term of [
   'workflow_dispatch:',
   "if: github.ref == 'refs/heads/main'",
   'GITHUB_REF_PROTECTED',
   'READ_ONLY_STAGING_ACCEPTANCE',
   'Demian cPanel Laravel API (manual and gated)',
   'Deploy Demian mobile release',
   'release-qa',
   'cpanel-staging-receipt-${{ github.sha }}',
   'phase11-pwa-bundle-${{ github.sha }}',
   '--approval=READ_ONLY_STAGING_SMOKE_APPROVED',
   'pr08_verify_staging.mjs',
 ]) assert.ok(stage.includes(term),term);
 assert.doesNotMatch(stage,/\n  push:|\n  pull_request:|scp |rsync |artisan migrate|actions\/deploy-pages|http\.post\s*\(/);
 assert.match(stage,/permissions:\n  contents: read\n  actions: read/);
 assert.match(stage,/environment:\n      name: cpanel-staging/);
});
test('PR08 canonical cPanel stage cannot bypass protected main or isolation',()=>{
 assert.match(canonical,/GITHUB_REF_PROTECTED/);
 assert.match(canonical,/CPANEL_ROOT.*staging/);
 assert.match(canonical,/CPANEL_API_ORIGIN.*staging/);
 assert.match(canonical,/CPANEL_CLIENT_ORIGIN.*staging/);
 assert.match(canonical,/pr08_stage_receipt\.mjs/);
 assert.match(canonical,/name: cpanel-staging-receipt-/);
 assert.match(canonical,/if: inputs.target == 'staging'/);
 assert.match(canonical,/cpanel-\$\{\{ inputs.target \}\}/);
 assert.match(deploy,/host_preflight\.php/);
 assert.match(preflight,/Staging financial flags must remain disabled/);
});
test('PR08 legacy PHP 8.3 workflow can never deploy again',()=>{
 assert.match(legacy,/PR08: this deprecated PHP 8\.3/);
 const jobs=['package','deploy'].map(x=>{
   const match=legacy.match(new RegExp('  '+x+':\\n([\\s\\S]*?)(?=\\n  [a-z-]+:|$)'));
   assert.ok(match,'Missing legacy job '+x);
   return match[1];
 });
 for(const block of jobs)assert.match(block,/if: github\.ref == 'refs\/heads\/main' && false/);
});
