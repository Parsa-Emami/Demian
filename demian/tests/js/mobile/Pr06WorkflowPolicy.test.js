import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const manual = read('../../../../.github/workflows/cpanel-api-deploy.yml');
const rehearsal = read('../../../../.github/workflows/pr06-cpanel-release-acceptance.yml');
const protectedAudit = read('../../../../.github/workflows/phase11-controlled-go-no-go.yml');
const packageScript = read('../../../ops/cpanel/package_release.sh');
const releaseTest = read('../../../ops/cpanel/ci_release_acceptance.sh');

test('PR06 rehearsal uses disposable DB and performs no deploy', () => {
  assert.match(rehearsal, /name: PR06 cPanel release acceptance \(CI only\)/);
  assert.match(rehearsal, /pull_request:\n/);
  assert.match(rehearsal, /branches: \[main\]/);
  assert.match(rehearsal, /mysql:8\.4/);
  assert.match(rehearsal, /php-version: '8\.4'/);
  assert.match(rehearsal, /composer install --no-interaction --no-dev/);
  assert.match(rehearsal, /ci_release_acceptance\.sh/);
  assert.doesNotMatch(rehearsal, /\n  deploy:/);
  assert.doesNotMatch(rehearsal, /secrets\./);
  assert.match(packageScript, /productionAuthorized/);
  assert.match(releaseTest, /financialFlagsActivated/);
  assert.match(releaseTest, /migrate --force --no-interaction/);
  assert.match(releaseTest, /phase1-api-evidence\.json/);
});

test('PR06 manual deploy refuses unprotected or unapproved production', () => {
  assert.match(manual, /workflow_dispatch:/);
  assert.doesNotMatch(manual, /\n  push:/);
  assert.match(manual, /GITHUB_REF_PROTECTED/);
  assert.match(manual, /prevent_self_review == true/);
  assert.match(manual, /required_reviewers/);
  assert.match(manual, /Phase 11 protected GO \/ NO-GO candidate audit/);
  assert.match(manual, /PR06 cPanel release acceptance \(CI only\)/);
  assert.match(manual, /BACKUP_RECEIPT.*\[a-f0-9\]\{64\}/);
  assert.match(manual, /StrictHostKeyChecking=yes/);
  assert.match(manual, /demian-cpanel\.manifest\.json/);
  assert.ok(manual.indexOf('sha256sum -c --status') <
    manual.indexOf('scp "${ssh_flags[@]}"'), 'Check digest before remote upload');
  assert.match(protectedAudit, /DEMIAN_PHASE11_ACCEPTANCE_B64/);
  assert.match(protectedAudit, /HUMAN_REVIEW_REQUIRED/);
  assert.doesNotMatch(rehearsal, /DEMIAN_COUPONS_ISSUE_ENABLED=true/);
});
