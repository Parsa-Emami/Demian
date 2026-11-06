export const ARCADE_DIFFICULTY = Object.freeze({ start: 6, maximum: 10, rampSeconds: 90 });

export function arcadeDifficulty(seconds = 0) {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const progress = 1 - Math.exp(-time / ARCADE_DIFFICULTY.rampSeconds);
    return Object.freeze({ level: 6 + 4 * progress, progress, pressure: 1 + .65 * progress });
}
