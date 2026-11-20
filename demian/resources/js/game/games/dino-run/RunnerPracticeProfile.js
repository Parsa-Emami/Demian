import ranked from '../../../../game/runner-rules.json' with { type: 'json' };

export const PRACTICE_VERSION = 'cafe-runner-practice-v1';
export const PRACTICE_BEST_KEY = 'demian.dino-run.best.' + PRACTICE_VERSION;
export const PRACTICE_RECORDS_KEY = 'demian.arcade.scores.' + PRACTICE_VERSION;
export const BEGINNER_PROFILE = Object.freeze({
    ...ranked,
    version: PRACTICE_VERSION,
    startSpeed: 260,
    maxSpeed: 470,
    speedRamp: 2.1,
    firstSpawnSeconds: 1.4,
    firstEncounterSeconds: 2,
    difficultyStart: 2,
    difficultyMax: 6,
    difficultyRampSeconds: 55,
    spawnMinimumSeconds: 1.8,
    spawnMinimumReduction: .55,
    spawnSpreadSeconds: .38,
    spawnSpreadReduction: .1,
    attackChance: .12,
    overheadChance: .25,
    obstacleScaleMinimum: .9,
    obstacleScaleSpread: .1,
    obstacleCatalog: Object.freeze(ranked.obstacleCatalog.map(o => Object.freeze({ ...o }))),
    attackers: Object.freeze([...ranked.attackers]),
});

export function isBeginnerProfile(profile) {
    return profile?.version === PRACTICE_VERSION;
}

export function beginnerDifficulty(seconds = 0) {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const progress = 1 - Math.exp(-time / BEGINNER_PROFILE.difficultyRampSeconds);
    return { progress, level: 2 + 4 * progress, pressure: 1 + .65 * progress };
}
