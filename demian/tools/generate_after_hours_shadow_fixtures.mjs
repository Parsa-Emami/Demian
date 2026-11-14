import AfterHoursShadow from '../resources/js/game/games/after-hours/AfterHoursShadow.js';
import { createShiftTerrain, SHIFT_RULES, SHIFT_START, SHADOW_ROUTE, circuitAt }
    from '../resources/js/game/games/after-hours/AfterHoursMap.js';

function playerFor(scenario,tick) {
    if(scenario==='patrol')return SHIFT_START;
    if(scenario==='chase')return {x:SHADOW_ROUTE[0].x+2.0,z:SHADOW_ROUTE[0].z+.5};
    if(scenario==='noise')return SHIFT_START;
    const t=tick/60;
    return {x:SHADOW_ROUTE[0].x+4*Math.sin(t*.8),
        z:SHADOW_ROUTE[0].z+2*Math.cos(t*.4)};
}
const scenarios=['patrol','chase','noise','moving'];
const fixtures=[];
for(const difficulty of ['standard','hard']){
    for(const scenario of scenarios){
        const terrain=createShiftTerrain();
        const shadow=new AfterHoursShadow(terrain,difficulty,SHIFT_RULES[difficulty]);
        const snapshots=[];
        const noise={id:1,x:SHADOW_ROUTE[0].x+3,z:SHADOW_ROUTE[0].z+2,radius:14,time:1.5};
        for(let tick=1;tick<=900;tick++){
            const player=playerFor(scenario,tick);
            const active=tick/60 >= SHIFT_RULES[difficulty].grace;
            const lit=circuitAt(player)!=='storage';
            const heard=scenario==='noise'&&tick>=90&&tick<141?noise:null;
            shadow.tick(1/60,{player,active,lit,noise:heard});
            if(tick%15===0)snapshots.push({
                tick,position:{...shadow.position},forward:{...shadow.forward},
                mode:shadow.mode,patrolIndex:shadow.patrolIndex,
                sightTime:shadow.sightTime,lostTime:shadow.lostTime
            });
        }
        fixtures.push({difficulty,scenario,snapshots});
        terrain.dispose();
    }
}
process.stdout.write(JSON.stringify(fixtures));
