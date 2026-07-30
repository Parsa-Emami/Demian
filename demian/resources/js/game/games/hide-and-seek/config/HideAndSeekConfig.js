export const HIDE_AND_SEEK_CONFIG = Object.freeze({
    version: 1,
    fixedStep: 1 / 60,
    participants: Object.freeze({ total: 4, seekerCount: 1 }),
    phases: Object.freeze({
        roleRevealSeconds: 2.4,
        hidingSeconds: 14,
        seekingSeconds: 90,
        roundEndSeconds: 2.2,
    }),
    player: Object.freeze({
        radius: 0.58,
        walkSpeed: 4.7,
        runSpeed: 7.1,
        acceleration: 16,
    }),
    ai: Object.freeze({
        seekerSpeed: 5.45,
        hiderSpeed: 4.5,
        thinkInterval: 0.16,
        repathInterval: 0.55,
        waypointTolerance: 0.38,
    }),
    vision: Object.freeze({
        range: 13.5,
        fieldOfViewDegrees: 105,
        revealThreshold: 0.52,
        hiddenRevealThreshold: 0.8,
        memorySeconds: 5.5,
    }),
    tag: Object.freeze({
        distance: 1.35,
        cooldownSeconds: 0.45,
    }),
    scoring: Object.freeze({
        survivalPerSecond: 4,
        hiddenPerSecond: 2,
        seekerTag: 450,
        seekerFastTagBonusPerSecond: 3,
        hiderWin: 1200,
        seekerWin: 900,
        escapeBonus: 350,
    }),
});
