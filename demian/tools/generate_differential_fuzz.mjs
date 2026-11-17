import { execFileSync } from 'node:child_process';
import DinoRunModel, { RUNNER_CONFIG } from '../resources/js/game/games/dino-run/DinoRunModel.js';
import RunnerReplay from '../resources/js/game/games/dino-run/RunnerReplay.js';

let state = 0x51a7cafe;
const seeds = Array.from({ length: 64 }, () => state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
const runner = seeds.map((seed, index) => {
    const width = [420, 960, 1440, 2560][index % 4];
    const model = new DinoRunModel({ seed, width }), replay = new RunnerReplay();
    const autoSeconds = index % 4 * 12;
    for (let tick = 0; tick < RUNNER_CONFIG.maxTicks; tick++) {
        const next = model.obstacles.find(obstacle => obstacle.x + obstacle.w > RUNNER_CONFIG.playerX - 14);
        const near = next && next.x - RUNNER_CONFIG.playerX < model.speed * (0.28 + index % 5 * 0.012);
        const auto = model.time < autoSeconds;
        const input = { jump: tick === 0 || Boolean(auto && near && next.response === 'jump' && model.y === 0),
            jumpHeld: index % 3 !== 0, duck: Boolean(auto && near && next.response === 'duck') };
        replay.record(input);
        model.step(1 / 60, input);
        if (model.status === 'over') break;
    }
    return { seed, width, ...replay.payload(), expected: { score: model.score, ticks: model.tick, passed: model.passed } };
});
const coffee = JSON.parse(execFileSync(process.execPath,
    [new URL('./generate_coffee_replay_fixtures.mjs', import.meta.url).pathname, ...seeds.map(String)],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
process.stdout.write(JSON.stringify({ corpusSeed: '51a7cafe', runner, coffee }));
