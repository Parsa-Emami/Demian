/**
 * F11-06/12/13: deliberately tiny read-only host/PWA parity probe.
 * Requires owner approval and real HTTPS; never registers players, calls POST,
 * redeems coupons, exposes raw bodies or claims 50-user capacity.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { auditCpanelHost } from '../verify_cpanel_host.mjs';
import { OFFLINE_GAME_IDS } from '../offline_pack_manifest.mjs';

const validOrigin = origin => typeof origin === 'string'
    && /^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(origin)
    && !origin.includes('..');
const textResult = async response => {
    if (response.status !== 200) throw Error('PWA static endpoint unavailable');
    const raw = await response.text();
    if (raw.length > 3 * 1048576) throw Error('Unbounded static response');
    return raw;
};

export async function phase11ReadOnlyHostProbe({
    target, pwaOrigin, apiOrigin, expectedSha, pwaReleaseId,
    fetcher = fetch, auditHost = auditCpanelHost,
} = {}) {
    if (!['staging', 'production'].includes(target)
        || !validOrigin(pwaOrigin) || !validOrigin(apiOrigin) || pwaOrigin === apiOrigin
        || !/^[a-f0-9]{40}$/.test(expectedSha ?? '')
        || !/^[a-f0-9]{16}$/.test(pwaReleaseId ?? '')) {
        throw Error('Explicit HTTPS PWA/API origins, target and release SHAs are required.');
    }
    const host = await auditHost({origin:apiOrigin, expectedSha, allowedOrigin:pwaOrigin, fetcher});
    if (host?.status !== 'passed') throw Error('API read-only host audit failed.');
    const paths=['/','/service-worker.js','/offline-packs.json','/manifest.webmanifest'];
    const records=[];
    const bodies={};
    for (const path of paths) {
        const start=performance.now();
        const response=await fetcher(pwaOrigin+path,{
            method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',
            headers:{Accept:'text/html,application/json,application/javascript','Cache-Control':'no-cache'},
            signal:AbortSignal.timeout(12000),
        });
        const body=await textResult(response);
        const elapsedMs=Math.round(performance.now()-start);
        bodies[path]=body;
        records.push({path,status:response.status,elapsedMs});
    }
    if (!bodies['/'].includes('name="demian-static-release" content="true"')) {
        throw Error('Public PWA does not match Demian static release format.');
    }
    const pack=JSON.parse(bodies['/offline-packs.json']);
    if (pack?.release !== pwaReleaseId || !Array.isArray(pack.games)
        || pack.games.length !== OFFLINE_GAME_IDS.length
        || !OFFLINE_GAME_IDS.every(id=>pack.games.some(game=>game.id===id))) {
        throw Error('Live PWA offline game catalog/release ID mismatches checked artifact.');
    }
    if (!bodies['/service-worker.js'].includes("const RELEASE_ID = '"+pwaReleaseId+"'")) {
        throw Error('Service worker deployment is stale or mismatched.');
    }
    const manifest=JSON.parse(bodies['/manifest.webmanifest']);
    if (manifest?.display !== 'standalone' || manifest.start_url !== './') {
        throw Error('Live installable manifest changed unexpectedly.');
    }
    return {
        schema:1,phase:11,status:'passed-read-only-parity',target,sourceSha:expectedSha,
        pwaReleaseId,apiOrigin,pwaOrigin,probes:records,apiProbes:host.probes?.length ?? null,
        tlsValidation:'default-strict',requestMethods:['GET','OPTIONS'],writeRequests:0,
        realDeviceAccepted:false,liveCapacityCertified:false,productionGoAuthorized:false,
        note:'Read-only HTTP probes cannot prove genuine physical device, authenticated coupon flow or hosting capacity.',
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const flags=Object.fromEntries(process.argv.slice(2).map(s=>{
            const index=s.indexOf('=');return [s.slice(0,index),s.slice(index+1)];
        }));
        const target=flags['--target'];
        const approval=target==='production' ? 'READ_ONLY_PRODUCTION_SMOKE_APPROVED'
            : 'READ_ONLY_STAGING_SMOKE_APPROVED';
        if (flags['--approval'] !== approval) throw Error('Owner approval is required for this target.');
        const report=await phase11ReadOnlyHostProbe({
            target,pwaOrigin:flags['--pwa-origin'],apiOrigin:flags['--api-origin'],
            expectedSha:flags['--sha'],pwaReleaseId:flags['--pwa-release'],
        });
        if (flags['--output']) writeFileSync(flags['--output'],JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify(report));
    } catch(e) {
        console.error('[Phase 11 live parity] FAILED: '+e.message);
        process.exitCode=1;
    }
}
