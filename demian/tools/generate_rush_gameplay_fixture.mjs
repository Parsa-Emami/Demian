import CafeRushModel from '../resources/js/game/games/cafe-rush/CafeRushModel.js';
import { RUSH_SPOTS } from '../resources/js/game/games/cafe-rush/CafeRushMap.js';

const seed = Number(process.argv[2] ?? 7);
const difficulty = process.argv[3] ?? 'standard';
const scenario = process.argv[4] ?? 'normal';
if (!Number.isSafeInteger(seed) || seed < 1) throw new Error('Invalid seed.');
const model = new CafeRushModel();
model.reset(difficulty, seed % 3);
model.start();

const byId = new Map(RUSH_SPOTS.map(spot => [spot.id, spot]));
const distance = (a,b) => Math.hypot(a.x-b.x, a.z-b.z);
const round = x => Math.round(x * 10000) / 10000;
const actions = [];
const transitions = [];
let previousControl = null;
let goalId = null;
let path = [];
let frame = 0;
let lastInteracted = -100;
let stuck = 0;
let previous = { ...model.player.position };
let carryingFrames = 0;
let deliberateSpill = false;

function targetId() {
    const carried = model.carriedOrder;
    if (carried) return 'table-' + carried.table;
    const ready = model.orders.find(o => o.state === 'ready');
    if (ready) return ready.recipe === 'cake' ? 'pastry' : 'bar';
    const accepted = model.acceptedOrder;
    if (accepted) return accepted.recipe === 'cake' ? 'pastry' : 'bar';
    const preparing = model.orders.find(o => o.state === 'preparing');
    if (preparing) return preparing.recipe === 'cake' ? 'pastry' : 'bar';
    if (model.waitingOrder) return 'tickets';
    return null;
}

function shouldInteract(goal) {
    if (!goal || model.nearby()?.id !== goal.id) return false;
    if (goal.kind === 'tickets') return Boolean(model.waitingOrder && !model.acceptedOrder);
    if (goal.kind === 'table') return Boolean(model.carriedOrder);
    if (goal.kind === 'station') {
        return Boolean(model.orders.find(o =>
            (o.state === 'accepted' || o.state === 'ready')
                && (o.recipe === 'cake' ? 'pastry' : 'bar') === goal.id));
    }
    return false;
}

function pathTo(position, target) {
    const navigation = model.ground.grid;
    const path = navigation.findPath(position, target, { smooth: false });
    if (path.length === 0) return [];
    if (!model.ground.canStand(target)) {
        const cell = navigation.nearestWalkable(navigation.worldToCell(target));
        if (cell) path[path.length-1] = navigation.cellToWorld(cell);
    }
    return path.slice(1);
}

for (frame = 1; frame <= 7200; frame++) {
    if (model.status !== 'running') break;
    const nextId = targetId();
    const goal = nextId ? byId.get(nextId) : null;
    const pos = model.player.position;
    if (nextId !== goalId || frame % 120 === 0) {
        goalId = nextId;
        path = goal ? pathTo(pos, goal) : [];
    }
    if (path.length > 0 && distance(pos, path[0]) < 0.24) path.shift();
    let input = { x:0, z:0, run:false, interact:false };
    if (frame < 7200 && shouldInteract(goal) && frame - lastInteracted > 12) {
        input.interact = true;
        lastInteracted = frame;
    } else if (goal && !shouldInteract(goal) && path.length > 0) {
        const waypoint = path[0];
        const dx = waypoint.x - pos.x;
        const dz = waypoint.z - pos.z;
        const length = Math.hypot(dx, dz);
        if (length >= .02) {
            input.x = dx / length;
            input.z = dz / length;
        }
    }
    // Differential stress path: provoke a REAL source-model spill by a hard
    // reverse under high carrying speed, then let the game recover naturally.
    if (scenario === 'spill' && !deliberateSpill && model.tray) {
        if (carryingFrames < 25) {
            input.run = true;
            carryingFrames++;
        } else if (model.player.speed > 7.25) {
            input.x = -model.player.forward.x;
            input.z = -model.player.forward.z;
            input.run = true;
            deliberateSpill = true;
        } else {
            input.run = true;
            carryingFrames++;
        }
    }
    // Original-game ranked contract: quantize the player's input BEFORE
    // advancing the actual source model so PHP sees identical axes.
    input.x = Math.round(input.x * 1000) / 1000;
    input.z = Math.round(input.z * 1000) / 1000;
    const control = [frame, input.x, input.z, Number(Boolean(input.run)),
        Number(Boolean(input.interact))];
    if (!previousControl
        || control.slice(1).some((value,index) => value !== previousControl[index+1])
    ) transitions.push(control);
    previousControl = control;
    // Snapshot the actual engine position immediately before interaction.
    // The interaction itself takes the next tick, preserving strict ordering.
    if (input.interact && frame > 1 && (actions.at(-1)?.tick ?? -1) < frame - 1) {
        actions.push({ tick:frame-1, kind:'move',
            x:round(pos.x), z:round(pos.z) });
    }
    model.advance(1/60, input);
    if (input.interact) {
        // Replayed server interactions have no client-entered target or
        // arbitrary order number. Server recomputes the nearest valid station.
        actions.push({ tick:frame, kind:'interact' });
    } else if (frame % 10 === 0 && frame < 7200) {
        const at = model.player.position;
        actions.push({ tick:frame, kind:'move', x:round(at.x), z:round(at.z) });
    }
    if (distance(model.player.position, previous) < 1e-5 && goal && !input.interact
        && (input.x !== 0 || input.z !== 0)) stuck++;
    else stuck = 0;
    if (stuck >= 45) {
        goalId = null;
        path = [];
        stuck = 0;
    }
    previous = { ...model.player.position };
}
const result = model.result();
if (transitions.at(-1)?.[0] !== 7200) {
    // Tick 7200 is the closing shift frame: no move or interaction occurs.
    const [,x,z,run] = previousControl;
    transitions.push([7200,x,z,run,0]);
}
model.dispose();
process.stdout.write(JSON.stringify({
    seed, difficulty, scenario, ticks:7200, actions, transitions, original_js:result,
    evidence:{ frames:frame-1, actions:actions.length },
}));
