import test from 'node:test';
import assert from 'node:assert/strict';
import {makePr08StageReceipt} from '../../../tools/qa/pr08_stage_receipt.mjs';
const base=()=>({
 sha:'a'.repeat(40),runId:12345,target:'staging',
 apiOrigin:'https://api-staging.example.test',
 pwaOrigin:'https://staging.example.test',
 archiveSha256:'b'.repeat(64),mainProtected:true,
});
test('PR08 stage receipt is SHA-bound, has no financial or production GO flags',()=>{
 const result=makePr08StageReceipt(base());
 assert.equal(result.kind,'demian-cpanel-staging-receipt');
 assert.equal(result.sourceSha,'a'.repeat(40));
 assert.equal(result.financialFeaturesActivated,false);
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.offsiteRestoreVerified,false);
 assert.equal(result.actualHost50VuAccepted,false);
});
test('PR08 cannot mint staging acceptance with production or foreign origins',()=>{
 for(const patch of [
  {sha:'invalid'},{runId:0},{target:'production'},{mainProtected:false},
  {apiOrigin:'https://api.example.test'},{pwaOrigin:'https://game.example.test'},
  {apiOrigin:'http://api-staging.example.test'},{archiveSha256:'invalid'},
  {apiOrigin:'https://staging.example.test'},
 ]){
  assert.throws(()=>makePr08StageReceipt({...base(),...patch}),/Refuse staging/);
 }
});
