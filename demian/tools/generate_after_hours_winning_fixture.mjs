import AfterHoursModel from '../resources/js/game/games/after-hours/AfterHoursModel.js';
import { SHIFT_LAYOUTS, SHIFT_EXIT, SHIFT_START }
    from '../resources/js/game/games/after-hours/AfterHoursMap.js';

const round = x => Math.round(x * 1000)/1000;
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

function solve(seed) {
    const model=new AfterHoursModel();
    model.reset('standard',seed%SHIFT_LAYOUTS.length);
    model.start();
    const evidence=[];
    let last=null,goalIndex=0,path=[],stuck=0,previousPos={...model.player.position};
    const goals=[
        {id:'card-1',...SHIFT_LAYOUTS[seed%3][0]},
        {id:'card-2',...SHIFT_LAYOUTS[seed%3][1]},
        SHIFT_EXIT,
    ];
    for(let tick=1;tick<=15000;tick++) {
        if(model.status!=='running')break;
        const goal=goals[goalIndex];
        if(!goal)break;
        const pos=model.player.position;
        let interact=false;
        // Actual source model chooses the closest visible interactable in range.
        if(model.nearby()?.id===goal.id) {
            const prior=model.status;
            const target=model.interact();
            interact=true;
            if(goal.id==='exit' && model.status==='escaped')goalIndex++;
            if(goal.id!=='exit' && model.cardCount===goalIndex+1)goalIndex++;
            path=[];
        }
        const newGoal=goals[goalIndex];
        if(!newGoal){
            const prior=last??[tick,0,0,0,0,null];
            evidence.push([tick,prior[1],prior[2],prior[3],1,null]);
            break;
        }
        if(path.length===0||tick%90===0){
            const grid=model.terrain.grid;
            const raw=grid.findPath(pos,newGoal,{smooth:false});
            if(raw.length===0)throw new Error('Unreachable goal '+newGoal.id);
            let nearest=raw.at(-1);
            if(!model.terrain.canStand(nearest)){
                const cell=grid.nearestWalkable(grid.worldToCell(newGoal));
                nearest=grid.cellToWorld(cell??grid.worldToCell(newGoal));
            }
            raw[raw.length-1]=nearest;
            path=raw.slice(1);
        }
        while(path.length&&distance(pos,path[0])<.21)path.shift();
        let x=0,z=0,run=false;
        if(path.length>0){
            const waypoint=path[0];
            const dx=waypoint.x-pos.x,dz=waypoint.z-pos.z;
            const len=Math.hypot(dx,dz);
            if(len>=.02) {
                x=round(dx/len);z=round(dz/len);run=true;
            }
        }
        const event=[tick,x,z,Number(run),Number(interact),null];
        if(!last||event.slice(1).some((v,i)=>v!==last[i+1]))evidence.push(event);
        last=event;
        if(model.status==='running')model.advance(1/60,{x,z,run});
        if(distance(previousPos,model.player.position)<.0005 && path.length)stuck++;
        else stuck=0;
        if(stuck>=20){path=[];stuck=0;}
        previousPos={...model.player.position};
    }
    const output={
        seed,difficulty:'standard',status:model.status,
        score:model.result().score,cards:model.cardCount,
        ticks:evidence.at(-1)?.[0]??0,
        frames:evidence,
    };
    // Terminal control must match the last simulation/escape frame exactly.
    if(output.status==='escaped'){
        const terminal=model.elapsed*60+1;
        output.ticks=evidence.at(-1)?.[0]??0;
    }
    model.dispose();
    return output;
}
const attempts=(process.argv[2]? [Number(process.argv[2])] : [1,0,2]);
const candidates=attempts.map(solve);
const winner=candidates.find(x=>x.status==='escaped');
process.stdout.write(JSON.stringify({
    winner:winner??null,
    attempts:candidates.map(x=>({seed:x.seed,status:x.status,
        ticks:x.ticks,score:x.score,cards:x.cards,frames:x.frames.length})),
}));
