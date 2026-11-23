import { readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluatePr07Lab, PR07_LAB_INPUTS } from './pr07_lab_policy.mjs';

export function collectPr07Lab({root,sha}) {
    const source = {};
    const missing = [];
    for (const [id,path] of PR07_LAB_INPUTS) {
        const full = resolve(root,path);
        try {
            const bytes = statSync(full).size;
            if (bytes < 2 || bytes > 2 * 1024 * 1024) throw Error('invalid size');
            source[id] = JSON.parse(readFileSync(full,'utf8'));
        } catch {
            missing.push(id);
        }
    }
    const report = evaluatePr07Lab(source,{headSha:sha});
    if (missing.length) {
        report.failures.push('Missing/unreadable CI QA: '+missing.join(','));
        report.status='failed';
        report.evidenceFiles = report.evidenceFiles.map(row=>({
            ...row,status:missing.includes(row.id)?'missing':row.status,
        }));
    }
    return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const root = resolve(import.meta.dirname,'../..');
    const report = collectPr07Lab({root,sha:process.env.GITHUB_SHA});
    const output = resolve(root,'docs/pr07/ci/lab-readiness.json');
    mkdirSync(dirname(output),{recursive:true});
    writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log('[PR07 laboratory]',report.status,'| 7 games, four virtual viewports, touch/PWA integrity; hardware: NOT VERIFIED');
    if (report.status !== 'passed') {
        console.error(report.failures.join('\n'));
        process.exitCode=1;
    }
}
