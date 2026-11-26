import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const script = join(root, 'demian/ops/github/main_branch_protection.sh');
const workflowOps = join(root, '.github/workflows/mobile11-ops-ci.yml');
const workflowRelease = join(root, '.github/workflows/pr06-cpanel-release-acceptance.yml');
const workflowPages = join(root, '.github/workflows/deploy-demian-pages.yml');
const workflowLoad = join(root, '.github/workflows/pr09-100-client-security-ci.yml');
const required = [
  'release-qa', 'package', 'contract', 'cpanel-runtime', 'build', 'load-100',
  'backend / replay-and-api (sqlite)', 'backend / replay-and-api (mysql)',
];

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, ...env },
  });
}

const plan = run('bash', [script, 'plan']);
assert.equal(plan.status, 0, plan.stderr);
const policy = JSON.parse(plan.stdout);

function makeFakeGh() {
  const dir = mkdtempSync(join(tmpdir(), 'demian-branch-policy-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const marker = join(dir, 'applied');
  const fixture = join(dir, 'policy.json');
  writeFileSync(fixture, JSON.stringify(policy));
  const gh = join(bin, 'gh');
  writeFileSync(gh, String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const a = process.argv.slice(2);
const marker = process.env.GH_MOCK_APPLIED;
const policy = JSON.parse(fs.readFileSync(process.env.GH_MOCK_POLICY, 'utf8'));
const endpoint = a.find(s => s.startsWith('/repos/')) || '';
if (a[0] === 'auth' && a[1] === 'status') process.exit(0);
if (a[0] !== 'api') process.exit(4);
if (a.includes('-X') && a.includes('PUT')) {
  const i = a.indexOf('--input');
  const proposed = JSON.parse(fs.readFileSync(a[i + 1], 'utf8'));
  if (JSON.stringify(proposed.required_status_checks.contexts) !== JSON.stringify(policy.required_status_checks.contexts)) process.exit(5);
  fs.writeFileSync(marker, 'enabled');
  process.stdout.write('{}');
} else if (endpoint.endsWith('/branches/main')) {
  process.stdout.write(JSON.stringify({protected:fs.existsSync(marker),commit:{sha:'a'.repeat(40)}}));
} else if (endpoint.endsWith('/branches/main/protection')) {
  const actual = {
    required_status_checks:policy.required_status_checks,
    enforce_admins:{enabled:true},
    required_pull_request_reviews:policy.required_pull_request_reviews,
    required_conversation_resolution:{enabled:true},
    allow_force_pushes:{enabled:false},
    allow_deletions:{enabled:false}
  };
  if (process.env.GH_MOCK_WEAK === '1') actual.enforce_admins.enabled = false;
  process.stdout.write(JSON.stringify(actual));
} else if (endpoint.includes('/collaborators?')) {
  const users = process.env.GH_MOCK_NO_REVIEWER === '1' ? [] : [
    {login:'independent-reviewer',permissions:{push:true,maintain:false,admin:false}}
  ];
  process.stdout.write(JSON.stringify(users));
} else if (endpoint.includes('/check-runs?')) {
  const names = policy.required_status_checks.contexts.filter(n => !(process.env.GH_MOCK_MISSING_CHECK === '1' && n === 'package'));
  process.stdout.write(JSON.stringify({check_runs:names.map(name=>({
    name,status:'completed',conclusion:'success',app:{slug:'github-actions'}
  }))}));
} else process.exit(6);
`, { mode: 0o755 });
  return {
    dir, marker,
    env: {
      PATH: bin + ':' + process.env.PATH,
      GH_MOCK_APPLIED: marker,
      GH_MOCK_POLICY: fixture,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('branch protection plan requires eight exact, strict, successful contexts and fresh independent approval', () => {
  assert.deepEqual(policy.required_status_checks.contexts, required);
  assert.equal(policy.required_status_checks.strict, true);
  assert.equal(policy.enforce_admins, true);
  assert.equal(policy.required_pull_request_reviews.required_approving_review_count, 1);
  assert.equal(policy.required_pull_request_reviews.dismiss_stale_reviews, true);
  assert.equal(policy.required_pull_request_reviews.require_last_push_approval, true);
  assert.equal(policy.required_conversation_resolution, true);
  assert.equal(policy.allow_force_pushes, false);
  assert.equal(policy.allow_deletions, false);
});

test('required jobs have unconditional PR and main push triggers (no path-filtered deadlocks)', () => {
  for (const file of [workflowOps, workflowRelease, workflowPages, workflowLoad]) {
    const source = readFileSync(file, 'utf8');
    const header = source.slice(0, source.indexOf('permissions:'));
    assert.match(header, /pull_request:\s*\n\s*branches:\s*\[main\]/, file);
    assert.match(header, /push:\s*\n\s*branches:\s*\[main\]/, file);
    assert.doesNotMatch(header, /^\s*paths(?:-ignore)?:/m, file);
  }
  const ops = readFileSync(workflowOps, 'utf8');
  assert.match(ops, /^\s{2}contract:/m);
  assert.match(ops, /^\s{2}cpanel-runtime:/m);
  assert.match(ops, /BranchProtectionPolicy\.test\.js/);
  assert.match(readFileSync(workflowRelease, 'utf8'), /^\s{2}package:/m);
  assert.match(readFileSync(workflowLoad, 'utf8'), /^\s{2}load-100:/m);
  assert.match(readFileSync(workflowPages, 'utf8'), /^\s{2}release-qa:/m);
});

test('preflight fails closed without a distinct write-capable reviewer', () => {
  const f = makeFakeGh();
  try {
    const r = run('bash', [script, 'preflight'], { ...f.env, GH_MOCK_NO_REVIEWER: '1' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /independent write-capable collaborator/);
  } finally { f.cleanup(); }
});

test('preflight fails closed when a required exact-SHA check is absent', () => {
  const f = makeFakeGh();
  try {
    const r = run('bash', [script, 'preflight'], { ...f.env, GH_MOCK_MISSING_CHECK: '1' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /required GitHub Actions checks/);
  } finally { f.cleanup(); }
});

test('apply without explicit owner approval cannot modify protection', () => {
  const f = makeFakeGh();
  try {
    const r = run('bash', [script, 'apply'], f.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Approval missing/);
    const verify = run('bash', [script, 'verify'], f.env);
    assert.notEqual(verify.status, 0);
  } finally { f.cleanup(); }
});

test('approved apply writes policy, verifies live state and is idempotent', () => {
  const f = makeFakeGh();
  try {
    const r = run('bash', [script, 'apply'], { ...f.env, DEMIAN_BRANCH_PROTECTION_APPROVED:'APPLY_MAIN_PROTECTION' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /VERIFIED: main protected/);
    const repeat = run('bash', [script, 'apply'], { ...f.env, DEMIAN_BRANCH_PROTECTION_APPROVED:'APPLY_MAIN_PROTECTION' });
    assert.equal(repeat.status, 0, repeat.stderr);
    const verify = run('bash', [script, 'verify'], f.env);
    assert.equal(verify.status, 0, verify.stderr);
    const rejected = run('bash', [script, 'verify'], { ...f.env, GH_MOCK_WEAK:'1' });
    assert.notEqual(rejected.status, 0);
  } finally { f.cleanup(); }
});
