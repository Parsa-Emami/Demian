import { createShiftTerrain, SHADOW_ROUTE, SHIFT_START, SHIFT_BOUNDS } from '../resources/js/game/games/after-hours/AfterHoursMap.js';
const ground = createShiftTerrain();
const points = [
    SHIFT_START,
    ...SHADOW_ROUTE,
    {x:-10.9,z:-34.6},
    {x:2.9,z:-9},
    {x:3.7,z:-68.5},
    {x:-1.8,z:-52.1},
];
const fixtures=[];
for(let i=0;i<points.length;i++){
    const from=points[i];
    for(let j=0;j<points.length;j+=3){
        const target=points[j];
        const goal=ground.grid.isWalkable(
            ground.grid.worldToCell(target).x,ground.grid.worldToCell(target).z)
            ? target : ground.grid.cellToWorld(
                ground.grid.nearestWalkable(ground.grid.worldToCell(target))
                    ?? ground.grid.worldToCell(target));
        fixtures.push({from,goal,path:ground.grid.findPath(from,goal)});
    }
}
ground.dispose();
process.stdout.write(JSON.stringify({bounds:SHIFT_BOUNDS,fixtures}));
