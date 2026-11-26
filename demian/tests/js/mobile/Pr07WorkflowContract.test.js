import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pages=readFileSync(new URL('../../../../.github/workflows/deploy-demian-pages.yml',import.meta.url),'utf8');
const field=readFileSync(new URL('../../../tools/qa/pr07_field_policy.mjs',import.meta.url),'utf8');
const collector=readFileSync(new URL('../../../tools/qa/pr07_collect.mjs',import.meta.url),'utf8');
const verifier=readFileSync(new URL('../../../tools/qa/pr07_verify_ci.mjs',import.meta.url),'utf8');

test('PR07 release QA consumes exact-SHA artifact after browser and backend checks',()=>{
    for(const token of [
        'node tools/qa/pr07_collect.mjs',
        'name: pr07-lab-${{ github.sha }}',
        'node demian/tools/qa/pr07_verify_ci.mjs',
        'DEMIAN_PR07_BACKEND_RESULT: ${{ needs.backend.result }}',
        'DEMIAN_PR07_BUILD_RESULT: ${{ needs.build.result }}',
    ])assert.ok(pages.includes(token),token);
    assert.ok(pages.indexOf('Step 31 aggregate all QA evidence')
        < pages.indexOf('node tools/qa/pr07_collect.mjs'));
    assert.ok(pages.indexOf('node tools/qa/pr07_collect.mjs')
        < pages.indexOf('name: pr07-lab-${{ github.sha }}'));
    assert.ok(pages.indexOf('node demian/tools/qa/pr07_verify_ci.mjs')
        > pages.indexOf('release-qa:'));
    assert.match(pages,/needs: \[build, backend\]/);
    assert.match(collector,/PR07_LAB_INPUTS/);
    assert.match(verifier,/verifyPr07LabReport/);
    assert.match(verifier,/NO_GO/);
});
test('PR07 private field reports never authorize production automatically',()=>{
    assert.match(field,/HUMAN_REVIEW_REQUIRED/);
    assert.match(field,/productionAuthorized:false/);
    assert.match(field,/hardwareAutomaticallyAttested:false/);
    assert.match(field,/recordingIncludesPersonalData===false/);
    assert.match(field,/restricted-private/);
    assert.doesNotMatch(field,/actions\/deploy-pages|artisan migrate/);
});
