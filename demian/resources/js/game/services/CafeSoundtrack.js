/**
 * Original code-authored, royalty-free-from-external-assets melodies.
 * No music samples or streamed music are needed. Not presented as a mastered
 * soundtrack: these are small CPU-bounded adaptive procedural scores.
 *
 * A phrase is eight quarter-note steps; both voices reuse two sustained
 * WebAudio oscillators with amplitude envelopes, not a growing node graph.
 */
const phrase = (root, bpm, lead, bass, leadWave = 'triangle') =>
    Object.freeze({ root, bpm, lead: Object.freeze(lead), bass: Object.freeze(bass), leadWave });

export const CAFE_SOUNDTRACKS = Object.freeze({
    'open-world': phrase(174.61, 92,  [0, 4, 7, 4, 9, 7, 4, 2], [-12, -12, -5, -5, -7, -7, -5, -5]),
    'dino-run': phrase(196, 138,     [0, 7, 5, 9, 7, 12, 9, 5], [-12, -5, -7, -5, -12, -5, -7, -5], 'square'),
    'after-hours': phrase(146.83, 76, [0, 3, 7, 3, -2, 3, 5, 3], [-12, -12, -9, -9, -7, -7, -9, -9], 'sine'),
    'cafe-rush': phrase(220, 132,    [0, 4, 7, 11, 7, 4, 9, 7], [-12, -5, -7, -5, -12, -5, -7, -5]),
    'cafe-critters': phrase(261.63, 84, [0, 2, 7, 9, 7, 4, 2, 4], [-12, -12, -5, -5, -9, -9, -5, -5], 'sine'),
    'coffee-crash': phrase(233.08, 112, [0, 5, 7, 12, 10, 7, 5, 2], [-12, -7, -5, -7, -12, -7, -5, -7]),
    'cafe-drift': phrase(207.65, 126, [0, 3, 7, 10, 7, 5, 3, 7], [-12, -7, -5, -7, -12, -7, -5, -7], 'square'),
});

export function cafeMusicFrame(gameId, step = 0) {
    const scene = CAFE_SOUNDTRACKS[gameId];
    if (!scene) return null;
    const index = Number.isSafeInteger(step) && step >= 0 ? step % scene.lead.length : 0;
    const hz = interval => scene.root * 2 ** (interval / 12);
    return Object.freeze({
        beatSeconds: 60 / scene.bpm,
        leadHz: hz(scene.lead[index]),
        bassHz: hz(scene.bass[index]),
        leadWave: scene.leadWave,
    });
}
