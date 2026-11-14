import { createCafeGround } from '../resources/js/game/shared/cafe/CafeGround.js';
import { CAFE_BOUNDS } from '../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import { SHIFT_BOUNDS } from '../resources/js/game/games/after-hours/AfterHoursMap.js';
import { RUSH_BOUNDS } from '../resources/js/game/games/cafe-rush/CafeRushMap.js';

const trials = [
    { id: 'after-hours', bounds: SHIFT_BOUNDS, origin: { x:-1.2, z:-6.5 } },
    { id: 'cafe-rush', bounds: RUSH_BOUNDS, origin: { x:-.35, z:-25.3 } },
    { id: 'open-world', bounds: CAFE_BOUNDS, origin: { x:.36, z:-4.68 } },
];
function solve({id, bounds, origin}) {
    const ground = createCafeGround({
        bounds, radius:.44, actors:{ player:origin }, owner:'replay-physics-parity',
    });
    const cases = [];
    let point = {...origin};
    let seed = 201114;
    for (let tick=1; tick<=450; tick++) {
        // Deterministic mixed cardinal/diagonal/zero and wall contacts.
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const angle = ((seed >>> 0)%360)*Math.PI/180;
        const speed = tick%7 === 0 ? 0 : tick%3 === 0 ? 11.6 : 5.4;
        const target = {
            x:point.x + Math.cos(angle)*speed/60,
            z:point.z + Math.sin(angle)*speed/60,
        };
        const result = ground.move('player',target);
        cases.push({from:point, target, result});
        point = {...result};
    }
    ground.dispose();
    return { id, bounds, cases };
}
process.stdout.write(JSON.stringify(trials.map(solve)));
