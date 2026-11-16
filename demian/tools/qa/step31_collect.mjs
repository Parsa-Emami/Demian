import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { evaluateStep31Evidence, REQUIRED_ARTIFACTS } from './step31_quality_policy.mjs';

export function collectStep31({ root, sha = null } = {}) {
    const reports = {};
    const missing = [];
    for (const check of REQUIRED_ARTIFACTS) {
        const file = join(root, 'docs', check.file);
        if (!existsSync(file)) { missing.push(check.id); continue; }
        try { reports[check.id] = JSON.parse(readFileSync(file, 'utf8')); }
        catch { missing.push(check.id); }
    }
    const result = evaluateStep31Evidence(reports, { commitSha: sha });
    if (missing.length) result.failures.push('Unreadable/missing CI files: ' + missing.join(', '));
    if (result.failures.length) result.status = 'failed';
    return result;
}

if (process.argv[1] && new URL('file://' + resolve(process.argv[1])).href === import.meta.url) {
    const root = resolve(import.meta.dirname, '../..');
    const report = collectStep31({ root, sha: process.env.GITHUB_SHA ?? null });
    const target = resolve(root, 'docs/phase6-step31/qa-evidence.json');
    mkdirSync(resolve(root, 'docs/phase6-step31'), { recursive: true });
    writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
    console.log('[Step 31 QA] ' + report.status.toUpperCase() + ' - '
        + report.ciChecks.filter(row => row.status === 'passed').length
        + '/' + REQUIRED_ARTIFACTS.length + ' required CI artifacts; production gate: BLOCKED (external).');
    if (report.failures.length) {
        console.error(report.failures.join('\n'));
        process.exitCode = 1;
    }
}
