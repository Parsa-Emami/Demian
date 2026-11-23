import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const workflow = read('../../../.github/workflows/cpanel-api-deploy.yml');
const packager = read('../../ops/cpanel/package_release.sh');
const rehearsal = read('../../../.github/workflows/pr06-cpanel-release-acceptance.yml');
const occurrences = (text, regex) => [...text.matchAll(regex)].length;

test('Manual cPanel workflow is one dispatch-only pipeline with pinned artifact identity', () => {
    assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
    assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
    for (const job of ['verify', 'package', 'deploy']) {
        assert.equal(occurrences(workflow, new RegExp('^  ' + job + ':$', 'gm')), 1,
            'Duplicate or missing job: ' + job);
    }
    assert.equal(occurrences(workflow, /^      - uses: actions\/upload-artifact@v4$/gm), 1);
    assert.match(workflow, /uses: .\/.github\/workflows\/arcade-backend.yml/);
    assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(workflow, /bash ops\/cpanel\/package_release.sh "\$RUNNER_TEMP" "\$GITHUB_SHA"/);
    assert.match(workflow, /PR06 cPanel release acceptance \(CI only\)/);
    assert.match(rehearsal, /name: PR06 cPanel release acceptance \(CI only\)/);
});

test('Manual deployment cannot bypass digest, SSH pinning, production reviews, or receipt', () => {
    const required = [
        '${{ runner.temp }}/demian-cpanel.tar.gz',
        '${{ runner.temp }}/demian-cpanel.sha256',
        '${{ runner.temp }}/demian-cpanel.manifest.json',
        'expected_digest="$(cat .cpanel-release/demian-cpanel.sha256)"',
        'sha256sum -c --status',
        'StrictHostKeyChecking=yes',
        'UserKnownHostsFile=$hosts',
        '[[ "$CPANEL_CONFIRM" == DEPLOY_PRODUCTION_WITH_BACKUP ]]',
        '[[ "$BACKUP_RECEIPT" =~ ^[a-f0-9]{64}$ ]]',
        '[[ "$GITHUB_REF_PROTECTED" == true ]]',
        'Phase 11 protected GO / NO-GO candidate audit',
        'environment_json="$(gh api',
        '.prevent_self_review == true',
        '.cpanel-release/demian-cpanel.manifest.json',
        '[[ "$CPANEL_CLIENT_ORIGIN" =~ $url_re',
        '[[ "$CPANEL_ROOT" == "/home/$CPANEL_USER/"*',
        'if-no-files-found: error',
    ];
    for (const term of required) {
        assert.ok(workflow.includes(term), 'Missing release safety check: ' + term);
    }
    assert.ok(workflow.indexOf('sha256sum -c --status') <
        workflow.indexOf('scp "${ssh_flags[@]}" .cpanel-release/demian-cpanel.tar.gz'));
    assert.doesNotMatch(workflow, /StrictHostKeyChecking=no/);
    assert.doesNotMatch(workflow, /^ "\$RUNNER_TEMP\/demian-cpanel\.sha256"$/m);
    for (const path of [
        'ops/cpanel/install_webroot_bridge.php',
        'ops/cpanel/restore_drill.sh',
        'ops/cpanel/backup_offsite.sh',
        'ops/cpanel/host_preflight.php',
        'ops/cpanel/rollback.sh',
    ]) {
        assert.ok(packager.includes(path), 'Missing required API-only release runtime: ' + path);
    }
});
