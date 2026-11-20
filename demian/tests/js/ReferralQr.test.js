import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {referralQrMatrix} from '../../resources/js/game/leaderboard/ReferralQr.js';

test('QR version 6-L byte mode matches an independent reference matrix',()=>{
    const matrix=referralQrMatrix('https://parsa-emami.github.io/Demian/#ref=ABCD1234567890EF');
    assert.equal(matrix.length,41);
    assert.ok(matrix.every(row=>row.length===41&&row.every(bit=>bit===0||bit===1)));
    assert.equal(createHash('sha256').update(JSON.stringify(matrix)).digest('hex'),
        '0a141cf510c76015004157efbdc40ff5069697b410accfa8f0c9dee8f88e75e1');
});
test('QR byte capacity is bounded',()=>{
    assert.equal(referralQrMatrix('x'.repeat(134)).length,41);
    assert.throws(()=>referralQrMatrix('x'.repeat(135)),RangeError);
    assert.throws(()=>referralQrMatrix('ی'.repeat(68)),RangeError);
});
