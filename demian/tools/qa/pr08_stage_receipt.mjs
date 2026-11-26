/**
 * Only invoked after the canonical manual *staging* cPanel deploy and
 * independent HTTPS smoke steps succeed. No secrets, financial actions,
 * database connections, hosting SSH or platform administration here.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const SHA=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
const origin=x=>typeof x==='string'&&/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(x)
    &&!x.includes('..')&&new URL(x).hostname.split('.').some(p=>p.includes('staging'));
export function makePr08StageReceipt({sha,runId,target,apiOrigin,pwaOrigin,
    archiveSha256,mainProtected,hostCheck}={}){
    if(!SHA.test(sha??'')||!Number.isSafeInteger(runId)||runId<1||target!=='staging'
        ||mainProtected!==true||!origin(apiOrigin)||!origin(pwaOrigin)
        ||apiOrigin===pwaOrigin||!HASH.test(archiveSha256??'')
        ||hostCheck?.schema!==1||hostCheck?.kind!=='demian-cpanel-staging-host-check'
        ||hostCheck.target!=='staging'||hostCheck.sourceSha!==sha
        ||hostCheck.php84Verified!==true||hostCheck.cronVerified!==true
        ||hostCheck.databaseDoctorPassed!==true||hostCheck.integrityPassed!==true
        ||hostCheck.couponAuditPassed!==true||hostCheck.productionAuthorized!==false
        ||hostCheck.offsiteRestoreVerified!==false||hostCheck.fiftyVuHostCapacityVerified!==false){
        throw Error('Refuse staging receipt: invalid protected SHA, target, HTTPS isolation or archive digest');
    }
    return {
        schema:1,kind:'demian-cpanel-staging-receipt',target:'staging',
        sourceSha:sha,githubRunId:runId,apiOrigin,pwaOrigin,archiveSha256,
        releaseArchiveVerified:true,pinnedSshHostUsed:true,
        hostSmokePassed:true,privatePathsVerified:true,
        stagingHostPreflightVerified:true,stagingCronVerified:true,
        productionAuthorized:false,financialFeaturesActivated:false,
        offsiteRestoreVerified:false,actualHost50VuAccepted:false,
        issuedAt:new Date().toISOString(),
        limitations:'Successful canonical GitHub staging deploy/smoke only; real database isolation, cron, backup restore, host quotas and commercial reward workflows require separate operator inspection.',
    };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    try{
        const [output,digestPath,hostCheckPath]=process.argv.slice(2);
        if(!output||!digestPath||!hostCheckPath)throw Error('Expected receipt output, digest and on-host evidence');
        const hostCheck=JSON.parse(readFileSync(hostCheckPath,'utf8'));
        const sha256=readFileSync(digestPath,'utf8').trim();
        const data=makePr08StageReceipt({
            sha:process.env.GITHUB_SHA,runId:Number(process.env.GITHUB_RUN_ID),
            target:process.env.CPANEL_TARGET,
            apiOrigin:process.env.CPANEL_API_ORIGIN,
            pwaOrigin:process.env.CPANEL_CLIENT_ORIGIN,
            mainProtected:process.env.GITHUB_REF_PROTECTED==='true',
            archiveSha256:sha256,hostCheck,
        });
        const file=resolve(output);mkdirSync(dirname(file),{recursive:true});
        writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
        console.log('[PR08] Exact-SHA staging deployment receipt generated: '+data.sourceSha);
    }catch(error){console.error('[PR08] Stage receipt NO_GO: '+error.message);process.exitCode=1;}
}
