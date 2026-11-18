import config from '../../../game/weekly-content.json' with { type: 'json' };

const EPOCH = Date.parse(config.epoch);
const WEEK_MS = 604800000;
export const WEEKLY_VERSIONS = Object.freeze(config.versions);
export const RUSH_STATION_REACH = config.rushStationReach;

export function weeklyIndex(at = Date.now()) {
    const time = new Date(at).getTime();
    return Number.isFinite(time) ? Math.max(0, Math.floor((time - EPOCH) / WEEK_MS)) : 0;
}

export function weeklyVersion(game, legacy, at = Date.now()) {
    return new Date(at).getTime() >= EPOCH ? WEEKLY_VERSIONS[game] ?? legacy : legacy;
}

export function runnerWeek(rules, week, character) {
    const cast = config.runnerCast.filter(slug => slug !== character);
    const pairs = cast.flatMap((first, index) => cast.slice(index + 1).map(second => [first, second]));
    const attackers = pairs[(week % pairs.length * 23) % pairs.length];
    const ground = rules.obstacleCatalog.filter(spot => spot.y === 0);
    const overhead = rules.obstacleCatalog.filter(spot => spot.y > 0);
    const groundStart = week % ground.length;
    const overheadStart = Math.floor(week / ground.length) % overhead.length;
    const groundCount = 5 + Math.floor(week / (ground.length * overhead.length)) % 3;
    const group = (items, start, count) => Array.from({ length: count }, (_, i) => items[(start + i) % items.length]);
    return {
        ...rules,
        attackers,
        obstacleCatalog: [...group(ground, groundStart, groundCount), ...group(overhead, overheadStart, 3)],
        attackChance: [.24, .29, .34][week % 3],
        overheadChance: [.26, .35, .43][Math.floor(week / 3) % 3],
    };
}

export function coffeeStageSpec(week, stage) {
    const slot = (week % 10000) * 3 + stage - 1;
    const primary = (slot * 3 + Math.floor(slot / 7)) % 5;
    const secondary = (primary + 1 + Math.floor(slot / 5) % 4) % 5;
    return {
        id: stage,
        seed: 1000003 + slot * 65537 + (config.coffeeSeedOffsets[slot] ?? 0),
        moves: 23 + stage * 2 + Math.floor(slot / 3) % 3,
        goals: [{ type: primary, count: 11 + slot % 5 + stage },
            ...(stage === 1 ? [] : [{ type: secondary, count: 7 + (slot * 3) % 8 }])],
    };
}

export function critterPack(week, guestCount = 8) {
    const pack = ((week % config.crittersPacks) * 313) % config.crittersPacks;
    const variations = guestCount * (guestCount - 1) * (guestCount - 2);
    let order = pack % variations;
    const variant = Math.floor(pack / variations);
    const available = Array.from({ length: guestCount }, (_, i) => i);
    return Array.from({ length: 3 }, (_, page) => {
        const size = available.length;
        const [guest] = available.splice(order % size, 1);
        order = Math.floor(order / size);
        return { guest, light: (guest + page + Math.floor(pack / 11)) % 2,
            food: (guest + page + Math.floor(pack / 7)) % 3,
            decor: (guest + page + Math.floor((pack % variations) / 19) + variant) % 3 };
    });
}

export function weeklyShiftCards(week) {
    const { front, back } = config.shiftCards;
    const index = (week % (front.length * back.length)) * 41 % (front.length * back.length);
    return [front[index % front.length], back[Math.floor(index / front.length)]].map(([x, z]) => ({ x, z }));
}

function orderedChoice(items, rank, count) {
    const offered = [...items];
    return Array.from({ length: count }, () => {
        const size = offered.length;
        const [choice] = offered.splice(rank % size, 1);
        rank = Math.floor(rank / size);
        return choice;
    });
}

export function weeklyRushOrder(week, order) {
    const variation = (week % 384) * 13 % 384;
    const recipeOrder = orderedChoice(['tea', 'cake', 'espresso'], variation % 6, 3);
    const tableMask = Math.floor(variation / 6);
    return { recipe: recipeOrder[order % 3], table: 1 + ((tableMask >> (order % 6)) & 1) };
}

export function weeklyWorldRoute(week) {
    return orderedChoice(config.worldPoints, (week % 120) * 73 % 120, 4)
        .map(([id, x, z]) => ({ id, x, z }));
}
