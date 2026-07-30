export const TETRIS_CONFIG = Object.freeze({
    board: Object.freeze({
        width: 10,
        visibleRows: 20,
        hiddenRows: 4,
    }),
    timing: Object.freeze({
        fixedStep: 1 / 60,
        lockDelaySeconds: 0.5,
        maxLockResets: 15,
        dasSeconds: 0.167,
        arrSeconds: 0.033,
        softDropIntervalSeconds: 0.033,
        lineClearEffectSeconds: 0.22,
    }),
    queue: Object.freeze({
        previewCount: 5,
    }),
    progression: Object.freeze({
        linesPerLevel: 10,
        maxLevel: 30,
    }),
});

export function gravityIntervalForLevel(level) {
    const safeLevel = Math.max(1, Math.min(Number(level) || 1, TETRIS_CONFIG.progression.maxLevel));
    const interval = Math.pow(Math.max(0.8 - ((safeLevel - 1) * 0.007), 0.05), safeLevel - 1);
    return Math.max(interval, 0.02);
}
