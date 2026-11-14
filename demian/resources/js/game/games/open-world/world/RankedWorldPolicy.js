/**
 * Ranked Open World is a separate bounded cafe route time trial. Persistent
 * world saves and fast travel MUST NOT influence its verified checkpoints.
 *
 * Keep this policy completely independent of Three.js/renderers so it can be
 * audited in Node, browsers, and a future server integration test.
 */
export const worldChallengeLocked = challenge =>
    ['starting', 'running', 'submitting'].includes(challenge?.state);

export function applySavePoint({ challenge, pointId, save }) {
    if (worldChallengeLocked(challenge)) {
        return {
            ranked: true,
            accepted: challenge.state === 'running'
                && challenge.checkpoint(pointId) === true,
        };
    }
    save(pointId);
    return { ranked: false, accepted: true };
}
