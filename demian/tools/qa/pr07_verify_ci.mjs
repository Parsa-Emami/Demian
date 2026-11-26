import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyPr07LabReport } from './pr07_lab_policy.mjs';

try {
    const file=resolve(process.argv[2]??'lab-readiness.json');
    const record=JSON.parse(readFileSync(file,'utf8'));
    const verdict=verifyPr07LabReport(record,{
        headSha:process.env.GITHUB_SHA,
        buildResult:process.env.DEMIAN_PR07_BUILD_RESULT,
        backendResult:process.env.DEMIAN_PR07_BACKEND_RESULT,
    });
    const msg = [
        '### PR07 — Real Device QA laboratory contract',
        '- Exact SHA: '+verdict.releaseSha,
        '- CI: PASS (7 games, 4 virtual viewports, touch, offline/PWA recovery, backend matrix).',
        '- Physical Android / iPhone Safari: **NOT VERIFIED** — requires real field testing.',
        '- Production / paid prizes: **NO_GO**, pending independently reviewed physical/host evidence.',
        '',
    ].join('\n');
    console.log(msg);
    if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,msg);
} catch(error) {
    console.error('[PR07] CI evidence rejected: '+error.message);
    process.exitCode=1;
}
