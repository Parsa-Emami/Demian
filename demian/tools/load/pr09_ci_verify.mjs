import { readFileSync,mkdirSync,writeFileSync,appendFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { evaluatePr09CiEvidence } from './pr09_ci_policy.mjs';
try{
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error('Missing CI evidence input or output file');
 const raw=readFileSync(input);
 if(raw.byteLength<40||raw.byteLength>1024*1024)throw Error('Invalid/oversized CI evidence');
 const report=evaluatePr09CiEvidence(JSON.parse(raw.toString('utf8')),{
  headSha:process.env.GITHUB_SHA,
  users:Number(process.env.DEMIAN_CI_LOAD_USERS||100),
 });
 const file=resolve(output);mkdirSync(dirname(file),{recursive:true});
 writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 const lines=[
  '### PR09 isolated 100-client replay and security acceptance',
  '- Source SHA: '+report.commitSha,
  '- Result: '+report.ciVerdict,
  '- Real cPanel 100 VUs, DNS/hosting provider, backup, phone and coupon race: **NOT CERTIFIED**.',
  '- Production and paid prizes: **NO_GO** until owner-controlled staging+Phase11 evidence.',
  '',
 ].join('\n');
 console.log(lines);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines);
 if(report.ciVerdict!=='CI_READY'){console.error(report.failures.join('\n'));process.exitCode=1;}
}catch(e){console.error('[PR09 CI] FAIL:',e.message);process.exitCode=2;}
