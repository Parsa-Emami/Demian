import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../../.github/workflows/cpanel-api-deploy.yml', import.meta.url), 'utf8');
const occurrences = (text, regex) => [...text.matchAll(regex)].length;

test('cPanel workflow has exactly one manual-only verification, packaging and deployment pipeline', () => {
    assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
    assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
    for (const job of ['verify', 'package', 'deploy']) {
        assert.equal(occurrences(workflow, new RegExp('^  ' + job + ':$', 'gm')), 1,
            'Duplicate or missing job: ' + job);
    }
    assert.equal(occurrences(workflow, /^      - uses: actions\/upload-artifact@v4$/gm), 1);
    assert.ok(workflow.includes('uses: ./.github/workflows/arcade-backend.yml'));
    assert.ok(workflow.includes("if: github.ref == 'refs/heads/main'"));
    assert.ok(workflow.includes('cancel-in-progress: false'));
});

test('cPanel deploy requires verifiable archive digest, pinned SSH and manual production approval', () => {
    const critical = [
        'bash ops/cpanel/package_release.sh "$RUNNER_TEMP" "$GITHUB_SHA"',
        "grep -Eq '^[a-f0-9]{64}
    for (const value of critical) {
        assert.ok(workflow.includes(value), 'Missing manual deploy safety gate: ' + value);
    }
    assert.ok(workflow.indexOf('sha256sum -c --status')
        < workflow.indexOf('scp "${ssh_flags[@]}" .cpanel-release/demian-cpanel.tar.gz'));
    assert.doesNotMatch(workflow, /grep -Eq '\^\[a-f0-9\]\{64\}\s*\n/);
    assert.doesNotMatch(workflow, /^ "\$RUNNER_TEMP\/demian-cpanel\.sha256"$/m);
    const packager = readFileSync(new URL('../ops/cpanel/package_release.sh', import.meta.url), 'utf8');
    for (const path of ['ops/cpanel/install_webroot_bridge.php',
        'ops/cpanel/restore_drill.sh','ops/cpanel/backup_offsite.sh',
        'ops/cpanel/host_preflight.php', 'ops/cpanel/rollback.sh']) {
        assert.ok(packager.includes(path), 'Missing release runtime: ' + path);
    }
    assert.doesNotMatch(workflow, /StrictHostKeyChecking=no/);
}); \"$RUNNER_TEMP/demian-cpanel.sha256\"",
        '${{ runner.temp }}/demian-cpanel.tar.gz',
        '${{ runner.temp }}/demian-cpanel.sha256',
        '${{ runner.temp }}/demian-cpanel.manifest.json',
        'pr06-cpanel-release-acceptance.yml',
        'PR06 cPanel release acceptance (CI only)',
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
    for (const value of critical) {
        assert.ok(workflow.includes(value), 'Missing manual deploy safety gate: ' + value);
    }
    assert.ok(workflow.indexOf('sha256sum -c --status')
        < workflow.indexOf('scp "${ssh_flags[@]}" .cpanel-release/demian-cpanel.tar.gz'));
    assert.doesNotMatch(workflow, /grep -Eq '\^\[a-f0-9\]\{64\}\s*\n/);
    assert.doesNotMatch(workflow, /^ "\$RUNNER_TEMP\/demian-cpanel\.sha256"$/m);
});