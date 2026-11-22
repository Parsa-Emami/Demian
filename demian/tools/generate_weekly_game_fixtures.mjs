import { runnerWeek, coffeeStageSpec, critterPack, weeklyShiftCards, weeklyRushOrder, weeklyWorldRoute } from '../resources/js/game/content/WeeklyContent.js';
import DinoRunModel, { RUNNER_CONFIG } from '../resources/js/game/games/dino-run/DinoRunModel.js';
import RunnerReplay from '../resources/js/game/games/dino-run/RunnerReplay.js';
import CoffeeCrashModel from '../resources/js/game/games/coffee-crash/CoffeeCrashModel.js';
import { weeklyCoffeeLevels } from '../resources/js/game/games/coffee-crash/CoffeeCrashData.js';
import { weeklyCritters } from '../resources/js/game/games/cafe-critters/CafeCrittersData.js';

const weeks = [0, 1, 7, 29, 53, 82, 105];
const fixtures = weeks.map(week => {
    const seed = 76453 + week * 101;
    const character = week % 2 === 1 ? 'amirreza' : 'darya';
    const profile = runnerWeek(RUNNER_CONFIG, week, character);
    const runner = new DinoRunModel({ seed, width: 420 });
    runner.reset({ seed, width: 420, profile });
    const proof = new RunnerReplay();
    for (let tick = 0; runner.status !== 'over'; tick++) {
        const input = { jump: tick === 0, jumpHeld: tick < 16, duck: false };
        proof.record(input);
        runner.step(1 / 60, input);
    }
    const levels = weeklyCoffeeLevels(week);
    const coffee = new CoffeeCrashModel(1, levels);
    const swaps = [];
    while (coffee.status === 'playing') {
        const [a, b] = coffee.findMove();
        swaps.push({ tick: (swaps.length + 1) * 10, kind: 'swap', a, b });
        coffee.swap(a, b);
    }
    const actions = [];
    for (const guest of weeklyCritters(week)) {
        for (const [field, option] of Object.entries(guest.setting)) {
            actions.push({ tick: (actions.length + 1) * 15, kind: 'select', field, option });
        }
        actions.push({ tick: (actions.length + 1) * 15, kind: 'invite' });
        actions.push({ tick: (actions.length + 1) * 15, kind: 'next' });
    }
    return { week, seed, character, profiles: { runner: profile, coffee: coffeeStageSpec(week, 1),
        critters: critterPack(week), after: weeklyShiftCards(week),
        rush: Array.from({ length: 6 }, (_, i) => weeklyRushOrder(week, i)), world: weeklyWorldRoute(week) },
    replays: {
        runner: { ...proof.payload(), score: runner.score, passed: runner.passed },
        coffee: { ticks: swaps.at(-1).tick + 1, actions: swaps, score: coffee.score, passed: coffee.collected.reduce((a, b) => a + b, 0) },
        critters: { ticks: actions.at(-1).tick + 1, actions },
    } };
});
process.stdout.write(JSON.stringify(fixtures));
