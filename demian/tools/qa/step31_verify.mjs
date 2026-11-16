/** Job-level Step 31 gate: both PHP DB modes and browser/build must succeed. */
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyCompositeStep31Gate } from './step31_quality_policy.mjs';

const file = resolve(process.argv[2] ?? 'qa-evidence.json');
try {
    const report = JSON.parse(readFileSync(file, 'utf8'));
    const outcome = verifyCompositeStep31Gate(report, {
        headSha: process.env.GITHUB_SHA,
        backendResult: process.env.DEMIAN_QA_BACKEND_RESULT,
        buildResult: process.env.DEMIAN_QA_BUILD_RESULT,
    });
    const summary = [
        '### Phase 6 Step 31 — independent release QA gate',
        '- Commit: \`' + outcome.headSha + '\`',
        '- CI: **PASS** — frontend browser/assets, PHP SQLite/MySQL and '
            + outcome.requiredArtifacts + ' signed-by-job report inputs.',
        '- Production/coupons: **BLOCKED** — '
            + report.productionRelease.outstanding.length + ' external evidence gates remain open.',
        '- This CI attestation is **not** real Android/iOS, security DAST, '
            + 'staging 50-user host load or offsite backup/restore certification.',
        '',
    ].join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
} catch (error) {
    console.error('[Step 31] Final composite gate FAILED: ' + error.message);
    process.exitCode = 1;
}
