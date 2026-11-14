import { createCafeGround } from '../resources/js/game/shared/cafe/CafeGround.js';
import { CAFE_BOUNDS } from '../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import { SHIFT_BOUNDS } from '../resources/js/game/games/after-hours/AfterHoursMap.js';
import { RUSH_BOUNDS } from '../resources/js/game/games/cafe-rush/CafeRushMap.js';
import { cafeRouteGoals } from '../resources/js/game/leaderboard/CafeRouteGoalCatalog.js';

// Canonical JS collision/nav geometry generates physically walkable replay
// fixtures; PHP must independently accept them WITHOUT trusting JS scores.
const GAMES = Object.freeze({
    'after-hours': { bounds: SHIFT_BOUNDS, origin: { x: -1.2, z: -6.5 } },
    'cafe-rush': { bounds: RUSH_BOUNDS, origin: { x: -.35, z: -25.3 } },
    'open-world': { bounds: CAFE_BOUNDS, origin: { x: .36, z: -4.68 } },
});
const seed = Number(process.argv[3] ?? 7);
const games = process.argv[2] ? [process.argv[2]] : Object.keys(GAMES);
const round = n => Math.round(n * 10000) / 10000;
const dist = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

function solve(gameId) {
    const info = GAMES[gameId];
    if (!info) throw new Error('Unknown game '+gameId);
    const start = { ...info.origin };
    const ground = createCafeGround({
        bounds: info.bounds, radius: .44, actors: { player: start },
        owner: 'ranked-route-fixture',
    });
    let position = start;
    let tick = 0;
    let lastGoalTick = 0;
    const actions = [];
    const goals = cafeRouteGoals(gameId, seed);
    for (const goal of goals) {
        const target = { x: goal.x, z: goal.z };
        const path = ground.grid.findPath(position, target, { smooth: false });
        if (!path.length) throw new Error('No nav path to '+goal.id);
        // The last path point may lie inside a prop; use the nearest
        // reachable grid center, which is within normal interaction reach.
        let destination = path[path.length-1];
        if (!ground.canStand(destination)) {
            const cell = ground.grid.nearestWalkable(ground.grid.worldToCell(target));
            if (!cell) throw new Error('No accessible checkpoint '+goal.id);
            destination = ground.grid.cellToWorld(cell);
        }
        if (dist(destination, target) >= 2.0) {
            throw new Error('Checkpoint is inaccessible from legal ground '+goal.id);
        }
        path[path.length-1] = destination;
        for (const waypoint of path.slice(1)) {
            if (dist(position, target) < 1.75) break;
            let stuck = 0;
            while (dist(position, waypoint) > .07 && dist(position, target) >= 1.75) {
                if (tick >= 17950 || actions.length >= 6400) {
                    throw new Error('Fixture resource bound exceeded.');
                }
                const length = dist(position, waypoint);
                const step = Math.min(.11, length);
                const candidate = {
                    x: position.x + (waypoint.x-position.x)/length*step,
                    z: position.z + (waypoint.z-position.z)/length*step,
                };
                const moved = ground.move('player', candidate);
                if (dist(position, moved) < .001) {
                    if (++stuck > 8) throw new Error('Collision-stuck path '+goal.id);
                } else stuck = 0;
                position = { x: round(moved.x), z: round(moved.z) };
                tick++;
                actions.push({ tick, kind: 'move', ...position });
            }
        }
        if (dist(position, target) >= 2.0) {
            throw new Error('Not close enough to '+goal.id);
        }
        while (tick - lastGoalTick < 21) {
            tick++;
            actions.push({ tick, kind: 'move', ...position });
        }
        tick++;
        actions.push({ tick, kind: 'checkpoint', target: goal.id });
        lastGoalTick = tick;
    }
    ground.dispose();
    return { game_id: gameId, seed, ticks: tick+1, actions,
        goals: goals.map(g => g.id) };
}
process.stdout.write(JSON.stringify(games.map(solve)));
