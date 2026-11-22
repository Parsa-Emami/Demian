import CafeDriftModel, { DRIFT } from '../resources/js/game/games/cafe-drift/CafeDriftModel.js';

const seeds = process.argv.slice(2).map(Number);
const cases = (seeds.length ? seeds : [4095, 4096, 4097, 4109, 4161, 19751, 14013, 11078]).flatMap(seed =>
    ['still', 'safe', 'near', 'sweep'].map(pattern => {
        const model = new CafeDriftModel(seed);
        const frames = [];
        let target = 0;
        while (!model.done) {
            if (model.tick % DRIFT.sampleTicks === 0) {
                const gate = model.gates[model.index];
                if (pattern === 'sweep') target = Math.round(Math.sin(model.tick / 40) * DRIFT.targetMax);
                if (pattern === 'safe' && gate) {
                    const lane = DRIFT.lanes.find(value => gate.obstacles.every(obstacle => Math.abs(obstacle.x - value) > DRIFT.near));
                    target = (gate.bean ?? lane) / DRIFT.targetUnit;
                }
                if (pattern === 'near' && gate) {
                    const obstacle = gate.obstacles[0].x;
                    target = (obstacle + (obstacle < 0 ? 700 : -700)) / DRIFT.targetUnit;
                }
                if (frames.at(-1)?.[1] !== target) frames.push([model.tick, target]);
            }
            model.step(target);
        }
        const { tick: ticks, score, passed, nearMisses, beans, cups } = model;
        return { seed, pattern, ticks, frames: [...frames, [ticks, 0]], expected: { score, ticks, passed }, nearMisses, beans, cups };
    }));
process.stdout.write(JSON.stringify(cases));
