import CafeCrittersModel from '../resources/js/game/games/cafe-critters/CafeCrittersModel.js';
import { CRITTERS } from '../resources/js/game/games/cafe-critters/CafeCrittersData.js';

const seeds = [1, 2, 7, 8, 113, 2147483647];
const fixtures = [];
for (const seed of seeds) {
    const model = new CafeCrittersModel('standard', CRITTERS.map(x => x.id), seed % CRITTERS.length);
    model.start();
    const actions = [];
    let last = 0;
    for (let page = 0; page < 3; page++) {
        const settings = model.guest.setting;
        for (const [field, option] of Object.entries(settings)) {
            last += 10;
            model.advance(10 / 60);
            if (!model.select(field, option)) throw new Error('JS rejected valid selection');
            actions.push({ tick: last, kind: 'select', field, option });
        }
        last += 40;
        model.advance(40 / 60);
        if (model.invite()?.type !== 'discovery') throw new Error('JS invite not accepted');
        actions.push({ tick: last, kind: 'invite' });
        last += 10;
        if (!model.next()) throw new Error('JS next not accepted');
        actions.push({ tick: last, kind: 'next' });
    }
    if (model.status !== 'finished' || !model.result().won || model.result().found !== 3) {
        throw new Error('JS did not finish all target guests');
    }
    fixtures.push({ seed, ticks: last + 1, actions,
        target_ids: model.targets.map(x => x.id),
        expected: { score: 3000 + 14400 - (last + 1), ticks: last + 1, passed: model.result().found } });
}
process.stdout.write(JSON.stringify(fixtures));
