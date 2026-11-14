import AfterHoursModel from '../resources/js/game/games/after-hours/AfterHoursModel.js';

const scenarios=[
    { difficulty:'standard', seed:7, max:300, plan: () => ({x:0,z:0,run:false}) },
    { difficulty:'hard', seed:8, max:480, plan: () => ({x:0,z:0,run:false}) },
    { difficulty:'standard', seed:7, max:1200,
        plan:tick => ({x:0,z:-1,run:tick%180<150}) },
    { difficulty:'hard', seed:9, max:1000,
        plan:tick => ({x:Math.cos(Math.floor(tick/100)),
            z:-Math.abs(Math.sin(Math.floor(tick/100))),run:tick%200<100}) },
    { difficulty:'standard', seed:7, max:300,
        plan:tick => tick<38?{x:.83,z:-.51,run:false}
            :{x:0,z:0,run:false}, powerAt:75 },
];
function generate(trial){
    const model=new AfterHoursModel();
    model.reset(trial.difficulty,trial.seed%3);
    model.start();
    const transitions=[];
    let previous=null,frame=0;
    for(let tick=1;tick<=trial.max;tick++){
        if(model.status!=='running')break;
        const input=trial.plan(tick);
        // Quantize BEFORE advance so the browser and PHP simulate exactly
        // the same signed compact control values.
        const x=Math.round(input.x*1000)/1000;
        const z=Math.round(input.z*1000)/1000;
        const run=Boolean(input.run);
        let interact=0,power=null;
        if(trial.powerAt===tick && model.nearby()?.kind==='panel'){
            const panel=model.interact();
            if(panel){model.switchPower('exit');interact=1;power='exit';}
        }
        const event=[tick,x,z,Number(run),interact,power];
        if(!previous||x!==previous[1]||z!==previous[2]||+run!==previous[3]
            ||interact)transitions.push(event);
        previous=event;
        if(model.status==='running')model.advance(1/60,{x,z,run});
        frame=tick;
    }
    if(transitions.at(-1)[0]!==frame){
        const last=transitions.at(-1);
        transitions.push([frame,last[1],last[2],last[3],0,null]);
    }
    const actual={
        status:model.status, score:model.result().score,
        passed:model.cardCount, relic:model.relic,
        elapsed:model.elapsed,
        player:{...model.player.position},
        shadow:{position:{...model.shadow.position},
            mode:model.shadow.mode,
            patrolIndex:model.shadow.patrolIndex,
            forward:{...model.shadow.forward}},
    };
    model.dispose();
    return {difficulty:trial.difficulty,seed:trial.seed,ticks:frame,
        transitions,actual};
}
process.stdout.write(JSON.stringify(scenarios.map(generate)));
