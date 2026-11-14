import CoffeeCrashModel from '../resources/js/game/games/coffee-crash/CoffeeCrashModel.js';

const defaults = [1, 2, 7, 113, 83071, 123456789, 2147483647, 4294967295];
const seeds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : defaults;
const fixtures = [];

for (const seed of seeds) {
    if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295) {
        throw new Error('Seed must be a positive unsigned 32-bit integer.');
    }
    const model = new CoffeeCrashModel(1);
    model.rng = seed;
    model.generate();
    const actions = [];
    for (let attempt = 0; attempt < 30 && model.status === 'playing'; attempt++) {
        const pair = model.findMove();
        if (!pair) throw new Error('Model must provide a valid move.');
        const result = model.swap(...pair);
        if (!result.accepted) throw new Error('Model findMove result was rejected.');
        actions.push({ tick: 60 * (attempt + 1), kind: 'swap', a: pair[0], b: pair[1] });
    }
    if (model.status === 'playing') throw new Error('Fixture did not reach terminal game state.');
    fixtures.push({
        seed, ticks: actions.at(-1).tick + 1, actions,
        expected: {
            score: model.score, ticks: actions.at(-1).tick + 1,
            passed: model.collected.reduce((sum, n) => sum + n, 0),
        },
        client: {
            result: model.status, moves: model.moves,
            collected: model.collected, bestChain: model.bestChain,
        }
    });
}
process.stdout.write(JSON.stringify(fixtures));
