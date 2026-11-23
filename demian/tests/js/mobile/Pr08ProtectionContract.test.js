import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../ops/github/main_branch_protection.sh',import.meta.url),'utf8');
test('PR08 owner-only branch protection requires PR review, strict checks and admin enforcement',()=>{
  assert.match(source,/main_branch_protection\.sh plan\|preflight\|apply\|verify/);
  assert.match(source,/gh api -X PUT/);
  assert.match(source,/DEMIAN_BRANCH_PROTECTION_APPROVED/);
  assert.match(source,/APPLY_MAIN_PROTECTION/);
  assert.match(source,/required_approving_review_count:1/);
  assert.match(source,/require_last_push_approval:true/);
  assert.match(source,/dismiss_stale_reviews:true/);
  assert.match(source,/enforce_admins:true/);
  assert.match(source,/allow_force_pushes:false/);
  assert.match(source,/allow_deletions:false/);
  assert.match(source,/strict:true/);
  for(const check of ['release-qa','package','cpanel-runtime','contract','build','load-100',
    'backend / replay-and-api (mysql)','backend / replay-and-api (sqlite)'])
    assert.ok(source.includes(check),check);
  assert.doesNotMatch(source,/gh auth token|echo \$GH_TOKEN/);
});
