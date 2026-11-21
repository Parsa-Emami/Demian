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
        "sha256sum \"$RUNNER_TEMP/demian-cpanel.tar.gz\"",
        "grep -Eq '^[a-f0-9]{64}$' \"$RUNNER_TEMP/demian-cpanel.sha256\"",
        '${{ runner.temp }}/demian-cpanel.tar.gz',
        '${{ runner.temp }}/demian-cpanel.sha256',
        'expected_digest="$(cat .cpanel-release/demian-cpanel.sha256)"',
        'sha256sum -c --status',
        'StrictHostKeyChecking=yes',
        'UserKnownHostsFile=$hosts',
        '[[ "$CPANEL_CONFIRM" == DEPLOY_PRODUCTION_WITH_BACKUP ]]',
        '[[ "$BACKUP_RECEIPT" != "-"',
        '[[ "$CPANEL_CLIENT_ORIGIN" =~ $url_re',
        '[[ "$CPANEL_ROOT" == "/home/$CPANEL_USER/"*',
        'if-no-files-found: error',
        'ops/cpanel/install_webroot_bridge.php',
        'ops/cpanel/restore_drill.sh',
        'ops/cpanel/backup_offsite.sh',
    ];
    for (const value of critical) {
        assert.ok(workflow.includes(value), 'Missing manual deploy safety gate: ' + value);
    }
    assert.ok(workflow.indexOf('sha256sum -c --status')
        < workflow.indexOf('scp "${ssh_flags[@]}" .cpanel-release/demian-cpanel.tar.gz'));
    assert.doesNotMatch(workflow, /grep -Eq '\^\[a-f0-9\]\{64\}\s*\n/);
    assert.doesNotMatch(workflow, /^ "\$RUNNER_TEMP\/demian-cpanel\.sha256"$/m);
});