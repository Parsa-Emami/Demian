import test from 'node:test';
import assert from 'node:assert/strict';
import { phase11ReadOnlyHostProbe } from '../../../tools/qa/phase11_remote_smoke.mjs';
import { OFFLINE_GAME_IDS } from '../../../tools/offline_pack_manifest.mjs';

const SHA='a'.repeat(40),PWA='b'.repeat(16);
const options=()=>({
 target:'staging',pwaOrigin:'https://staging.game.example.test',
 apiOrigin:'https://api-staging.example.test',expectedSha:SHA,pwaReleaseId:PWA,
});
const mock=(change={})=>{
 const calls=[];
 const get=async (url, options)=>{
   calls.push({url,options});
   const path=new URL(url).pathname;
   const output=path==='/' ? '<meta name="demian-static-release" content="true">'
    : path==='/service-worker.js' ? "const RELEASE_ID = '"+(change.swId ?? PWA)+"';"
    : path==='/offline-packs.json' ? JSON.stringify({
      release:change.packId ?? PWA,games:OFFLINE_GAME_IDS.map(id=>({id}))
    })
    : JSON.stringify({display:'standalone',start_url:'./'});
   return {status:change.status ?? 200,text:async()=>output};
 };
 const host=async({origin,expectedSha,allowedOrigin,fetcher})=>{
   assert.equal(origin,'https://api-staging.example.test');
   assert.equal(expectedSha,SHA);
   assert.equal(allowedOrigin,'https://staging.game.example.test');
   assert.equal(fetcher,get);
   return {status:'passed',probes:[{path:'/up',status:200}]};
 };
 return {get,host,calls};
};
test('F11 live staging read-only smoke checks exact PWA worker/manifest/API parity',async()=>{
 const {get,host,calls}=mock();
 const result=await phase11ReadOnlyHostProbe({...options(),fetcher:get,auditHost:host});
 assert.equal(result.status,'passed-read-only-parity');
 assert.equal(result.writeRequests,0);
 assert.equal(result.realDeviceAccepted,false);
 assert.equal(result.productionGoAuthorized,false);
 assert.equal(calls.length,4);
 assert.ok(calls.every(c=>c.options.method==='GET' && c.options.credentials==='omit'
     && c.options.redirect==='manual'));
});
test('F11 release parity fails closed on mismatched PWA, insecure host and missing approval parameters',async()=>{
 for(const change of [{swId:'0'.repeat(16)},{packId:'0'.repeat(16)},{status:503}]){
  const {get,host}=mock(change);
  await assert.rejects(phase11ReadOnlyHostProbe({...options(),fetcher:get,auditHost:host}));
 }
 for(const override of [{apiOrigin:'http://insecure.test'},{pwaOrigin:'https://user:pw@bad.test'},
  {expectedSha:'short'},{pwaReleaseId:'unknown'},{target:'live'}]){
  const {get,host}=mock();
  await assert.rejects(phase11ReadOnlyHostProbe({...options(),...override,fetcher:get,auditHost:host}));
 }
});
