import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const get=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const host=get('../../../ops/cpanel/staging_acceptance.sh');
const pkg=get('../../../ops/cpanel/package_release.sh');
const workflow=get('../../../../.github/workflows/cpanel-api-deploy.yml');
test('PR08 real staging host audit is read-only, bounded and tied to the checked SHA',()=>{
 for(const term of ['readlink -f','crontab -l','host_preflight.php',
    'arcade:hosting:doctor --target=staging --json',
    'arcade:integrity --json','arcade:audit-coupons --json',
    'fiftyVuHostCapacityVerified','offsiteRestoreVerified']){
    assert.ok(host.includes(term),term);
 }
 assert.doesNotMatch(host,/artisan migrate|migrate:rollback|http\.post|queue:work/);
 assert.match(pkg,/ops\/cpanel\/staging_acceptance\.sh/);
 assert.match(workflow,/ops\/cpanel\/staging_acceptance\.sh/);
 assert.match(workflow,/GITHUB_REF_PROTECTED/);
 const result=spawnSync('bash',['-n',new URL('../../../ops/cpanel/staging_acceptance.sh',import.meta.url).pathname],
     {encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
