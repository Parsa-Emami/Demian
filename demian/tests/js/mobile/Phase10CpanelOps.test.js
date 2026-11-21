import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readlinkSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = path => new URL('../../../ops/cpanel/' + path, import.meta.url);
const read = path => readFileSync(file(path), 'utf8');
const version = 'c'.repeat(40);
const prior = 'd'.repeat(40);
const origin = 'https://api.staging.example.invalid';

test('F10-06/07/08/09/13 cPanel scripts have valid bash syntax and forbidden operations are absent', () => {
    for (const name of ['cron.sh','deploy.sh','rollback.sh','backup_offsite.sh','restore_drill.sh']) {
        const result=spawnSync('bash',['-n',file(name).pathname],{encoding:'utf8'});
        assert.equal(result.status,0,name+': '+result.stderr);
        assert.match(read(name),/set -Eeuo pipefail/);
    }
    const backup=read('backup_offsite.sh');
    assert.match(backup,/--single-transaction/);
    assert.match(backup,/age -r/);
    assert.match(backup,/--defaults-extra-file/);
    assert.match(backup,/SHA256|sha256sum/);
    assert.doesNotMatch(backup,/mysqldump.*>\s*[^|]/);
    const restore=read('restore_drill.sh');
    assert.match(restore,/_(restore\|drill)/);
    assert.match(restore,/age -d/);
    assert.match(restore,/production_db/);
    assert.doesNotMatch(restore,/DROP DATABASE|db:wipe|migrate:rollback/);
    const rollback=read('rollback.sh');
    assert.match(rollback,/ROLLBACK_CODE_ONLY_DB_COMPATIBLE/);
    assert.match(rollback,/flock -n 9/);
    assert.match(rollback,/switch_to "\$previous"/);
    assert.doesNotMatch(rollback,/artisan migrate\s|migrate:rollback|db:wipe/);
});

function fixture() {
    const home=mkdtempSync(join(tmpdir(),'demian-phase10-'));
    const root=join(home,'demian-api');
    const bin=join(home,'bin');
    const oldDir=join(root,'releases',prior);
    const newDir=join(root,'releases',version);
    for(const path of [bin,oldDir,newDir,join(root,'shared')])mkdirSync(path,{recursive:true});
    const current=join(root,'current');
    symlinkSync(oldDir,current);
    writeFileSync(join(root,'shared','.env'),'APP_ENV=staging\nAPP_DEBUG=false\n',{mode:0o600});
    for(const dir of [oldDir,newDir]) {
        writeFileSync(join(dir,'artisan'),'fixture\n');
        mkdirSync(join(dir,'vendor'),{recursive:true});
        writeFileSync(join(dir,'vendor','autoload.php'),'fixture\n');
    }
    mkdirSync(join(newDir,'ops','cpanel'),{recursive:true});
    writeFileSync(join(newDir,'ops','cpanel','host_preflight.php'),'<?php\n');
    writeFileSync(join(newDir,'.mobile11-release'),version+'\n');
    const trace=join(home,'trace');
    writeFileSync(trace,'');
    const mockPhp=join(bin,'mock-php');
    writeFileSync(mockPhp, [
        '#!/usr/bin/env bash',
        'set -eu',
        'if [[ "$1" == -r ]]; then exec php "$@"; fi',
        'if [[ "$1" == */host_preflight.php ]]; then exit 0; fi',
        'printf "%s\\n" "$*" >> "$TRACE"',
    ].join('\n')+'\n',{mode:0o755});
    writeFileSync(join(bin,'curl'),[
        '#!/usr/bin/env bash',
        'set -eu',
        'if [[ "$ROLLBACK_BAD" == yes ]]; then printf "{\\"status\\":\\"down\\"}";',
        'else printf "{\\"status\\":\\"ok\\",\\"release\\":\\"%s\\"}" "$RELEASE_SHA"; fi',
    ].join('\n')+'\n',{mode:0o755});
    const env=bad=>({...process.env,HOME:home,PATH:bin+':'+process.env.PATH,
        TRACE:trace,ROLLBACK_BAD:bad?'yes':'no',RELEASE_SHA:version});
    return {home,root,bin,oldDir,newDir,current,trace,mockPhp,env,
        dispose:()=>rmSync(home,{recursive:true,force:true})};
}

test('F10-06 one-shot cron and optional queue are bounded without a resident daemon',()=>{
    const f=fixture();
    try{
        writeFileSync(join(f.newDir,'artisan'),'fixture\n');
        rmSync(f.current);
        symlinkSync(f.newDir,f.current);
        const a=spawnSync('bash',[file('cron.sh').pathname,f.current,f.mockPhp,'schedule'],{
            env:f.env(false),encoding:'utf8',timeout:10000});
        assert.equal(a.status,0,a.stderr);
        assert.match(readFileSync(f.trace,'utf8'),/artisan schedule:run --no-ansi/);
        const q=spawnSync('bash',[file('cron.sh').pathname,f.current,f.mockPhp,'queue'],{
            env:f.env(false),encoding:'utf8',timeout:10000});
        assert.equal(q.status,0,q.stderr);
        const events=readFileSync(f.trace,'utf8');
        assert.match(events,/queue:work database --stop-when-empty --max-time=45/);
        assert.doesNotMatch(events,/queue:listen|--daemon/);
        const invalid=spawnSync('bash',[file('cron.sh').pathname,f.current,f.mockPhp,'bad'],{
            env:f.env(false),encoding:'utf8'});
        assert.notEqual(invalid.status,0);
    }finally{f.dispose();}
});

function rollback(bad=false,ack='ROLLBACK_CODE_ONLY_DB_COMPATIBLE'){
    const f=fixture();
    try{
        const r=spawnSync('bash',[file('rollback.sh').pathname,f.root,version,origin,f.mockPhp,ack],{
            env:f.env(bad),encoding:'utf8',timeout:15000});
        assert.ifError(r.error);
        return {
            status:r.status,stderr:r.stderr,
            active:readlinkSync(f.current),
            journal:existsSync(join(f.root,'shared','rollback-journal.log'))
                ?readFileSync(join(f.root,'shared','rollback-journal.log'),'utf8'):'',
        };
    }finally{f.dispose();}
}

test('F10-07/13 approved manual rollback switches only code and creates an audit entry',()=>{
    const r=rollback();
    assert.equal(r.status,0,r.stderr);
    assert.ok(r.active.endsWith(version));
    assert.match(r.journal,/migrations=unchanged/);
});
test('F10-07/13 failed rollback target restores current code; no DB or award mutations',()=>{
    const r=rollback(true);
    assert.notEqual(r.status,0);
    assert.ok(r.active.endsWith(prior));
    assert.equal(r.journal,'');
});
test('F10-13 missing schema-compatibility acknowledgement never changes current release',()=>{
    const r=rollback(false,'NO_ACK');
    assert.notEqual(r.status,0);
    assert.ok(r.active.endsWith(prior));
    assert.equal(r.journal,'');
});

test('F10-02/03/05/14 no public PHP credentials or unaudited coupon enablement in fixed bridge',()=>{
    const bridge=read('install_webroot_bridge.php');
    assert.match(bridge,/DEMIAN_API_SUBDOMAIN_ONLY/);
    assert.match(bridge,/DEMIAN_CPANEL_BRIDGE_V1/);
    assert.match(bridge,/is_link/);
    assert.match(bridge,/Require all denied/);
    assert.match(bridge,/RewriteEngine On/);
    assert.match(bridge,/DEMIAN_PRIVATE_ROOT/);
    assert.doesNotMatch(bridge,/putenv\(|include\(\$.*\.env/);
    const host=read('host_preflight.php');
    for(const flag of ['DEMIAN_PRIZE_VERIFIED_PHONE_REQUIRED','DEMIAN_PHONE_OTP_ENABLED',
        'DEMIAN_COUPONS_POLICY_APPROVED','DEMIAN_LEGAL_REQUIRE_ACCEPTANCE']) {
        assert.ok(host.includes(flag),flag);
    }
});
