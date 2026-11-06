import { writeFileSync } from 'node:fs';
import DinoRunModel, { RUNNER_CONFIG } from '../resources/js/game/games/dino-run/DinoRunModel.js';
import RunnerReplay from '../resources/js/game/games/dino-run/RunnerReplay.js';
const fixtures = [];
for (const [seed, width, autoplaySeconds] of [[7,420,0],[127,960,0],[4294967295,420,20],[8123,1440,90]]) {
    const model = new DinoRunModel({ seed, width }), replay = new RunnerReplay();
    for (let tick = 0; tick < RUNNER_CONFIG.maxTicks; tick++) {
        const next = model.obstacles.find(o => o.x + o.w > RUNNER_CONFIG.playerX - 14);
        const near = next && next.x - RUNNER_CONFIG.playerX < model.speed * .31;
        const auto = model.time < autoplaySeconds;
        const input = { jump: tick === 0 || Boolean(auto && near && next.type === 'cactus' && model.y === 0),
            jumpHeld: true, duck: Boolean(auto && near && next.type === 'bird') };
        replay.record(input); model.step(1/60,input);
        if (model.status === 'over') break;
    }
    fixtures.push({ seed, width, ...replay.payload(), expected: { score:model.score,ticks:model.tick,passed:model.passed } });
}
writeFileSync(new URL('../tests/Fixtures/runner-replays.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
console.log(`Generated ${fixtures.length} deterministic cross-language replay fixtures.`);
