import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import DinoRunModel, { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';

test('v2 starts hard with eight varied hazards and alternates the two named attackers',()=>{
    const model=new DinoRunModel({seed:55,width:420});
    assert.equal(RUNNER_CONFIG.version,'cafe-runner-v2');assert(model.difficulty.level>=8);assert(model.speed>=390);
    const seen=new Set(),attackers=[];
    for(let i=0;i<160;i++){model.spawn();const o=model.obstacles.at(-1);seen.add(o.appearance);if(o.attacker){attackers.push(o.attacker);assert(o.warningLeft>=1);assert(model.spawnIn>=o.warningLeft+.9);}}
    for(const definition of RUNNER_CONFIG.hazards)assert(seen.has(definition.appearance));
    assert.deepEqual(attackers.slice(0,4),['uzudi','amirreza','uzudi','amirreza']);
});

test('warning projectiles do not hit or travel before launch; active attacks remain dodgeable',()=>{
    const warned=new DinoRunModel();warned.status='running';warned.spawnIn=99;
    warned.obstacles=[{...RUNNER_CONFIG.attacks[0],x:RUNNER_CONFIG.playerX,previousX:RUNNER_CONFIG.playerX,warningLeft:1,age:0}];
    warned.step(1/60);assert.equal(warned.status,'running');assert.equal(warned.obstacles[0].x,RUNNER_CONFIG.playerX);
    for(const attack of RUNNER_CONFIG.attacks)for(const avoid of [false,true]){
        const model=new DinoRunModel();model.status='running';model.spawnIn=99;
        if(avoid&&attack.type==='cactus')model.y=45;
        model.obstacles=[{...attack,x:RUNNER_CONFIG.playerX,previousX:RUNNER_CONFIG.playerX,warningLeft:0,age:1.1}];
        model.step(1/60,{duck:avoid&&attack.type==='bird'});assert.equal(model.status,avoid?'running':'over');
    }
});

test('runner presents both attackers and action cues without displaying a difficulty meter',()=>{
    const source=readFileSync(new URL('../../../resources/js/game/games/dino-run/DinoRunGame.js',import.meta.url),'utf8');
    assert(source.includes("['uzudi', 'amirreza']"));assert(source.includes('drawRaiders'));
    assert(!source.includes('data-run-difficulty'));assert(!source.includes('difficultyNode'));assert(!source.includes('سختی از'));
});
