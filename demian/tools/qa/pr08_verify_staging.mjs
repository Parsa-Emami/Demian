import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {evaluatePr08Staging} from './pr08_staging_policy.mjs';
try{
    const paths=process.argv.slice(2);
    if(paths.length!==4)throw Error('Expected receipt.json parity.json pwa-audit.json output.json');
    const [receipt,probe,pwaAudit]=paths.slice(0,3).map(path=>{
        const raw=readFileSync(resolve(path));
        if(raw.length>1024*1024)throw Error('Oversized staging evidence');
        return JSON.parse(raw.toString('utf8'));
    });
    const headSha=process.env.GITHUB_SHA;
    const runId=Number(process.env.PR08_STAGING_RUN_ID);
    const report=evaluatePr08Staging({receipt,probe,pwaAudit},{
        headSha,stagingRunId:runId,pwaReleaseId:process.env.PR08_PWA_RELEASE_ID,
        apiOrigin:process.env.PR08_API_ORIGIN,pwaOrigin:process.env.PR08_PWA_ORIGIN,
        mainProtected:process.env.GITHUB_REF_PROTECTED==='true',
    });
    const output=resolve(paths[3]);
    mkdirSync(dirname(output),{recursive:true});
    writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    const summary=[
        '### PR08 staging read-only acceptance',
        '- Exact commit: '+(report.releaseSha??'unknown'),
        '- Result: '+report.verdict,
        '- Actual cPanel capacity / offsite restore / physical devices / financial prizes: **NOT CERTIFIED**',
        '- Production: **NO_GO**; four independent Phase11 signatures remain necessary.',
        '',
    ].join('\n');
    console.log(summary);
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
    if(report.blockers.length){console.error(report.blockers.join('\n'));process.exitCode=1;}
}catch(error){console.error('[PR08] NO_GO:',error.message);process.exitCode=2;}
