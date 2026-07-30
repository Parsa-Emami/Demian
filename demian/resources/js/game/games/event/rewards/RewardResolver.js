function eligible(reward, { score, completedIds }) {
    const conditions = reward.conditions ?? {};
    if (Number(conditions.minScore ?? 0) > score) return false;
    if (conditions.objectiveId && !completedIds.has(conditions.objectiveId)) return false;
    return true;
}

function createReceipt({ id, eventId, sessionId, successful, score, rewards }) {
    const totals = { coin: 0, xp: 0 };
    const unlocks = { badges: [], cosmetics: [] };
    const frozenRewards = rewards.map((reward) => Object.freeze({ ...reward }));

    for (const reward of frozenRewards) {
        if (reward.type === 'coin' || reward.type === 'xp') {
            totals[reward.type] += Math.max(0, Number(reward.amount) || 0);
        }
        if (reward.type === 'badge') unlocks.badges.push(reward.id);
        if (reward.type === 'cosmetic') unlocks.cosmetics.push(reward.id);
    }

    return Object.freeze({
        id,
        eventId,
        sessionId,
        successful: Boolean(successful),
        score: Math.max(0, Number(score) || 0),
        rewards: Object.freeze(frozenRewards),
        totals: Object.freeze(totals),
        unlocks: Object.freeze({
            badges: Object.freeze(unlocks.badges),
            cosmetics: Object.freeze(unlocks.cosmetics),
        }),
    });
}

export default class RewardResolver {
    resolve(definition, {
        sessionId,
        successful,
        score = 0,
        objectives = [],
    } = {}) {
        const completedIds = new Set(
            objectives
                .filter((item) => item.status === 'completed')
                .map((item) => item.id)
        );
        const rewards = successful
            ? (definition.rewards ?? []).filter((reward) => eligible(reward, { score, completedIds }))
            : [];

        return createReceipt({
            id: `${definition.id}:${sessionId}`,
            eventId: definition.id,
            sessionId,
            successful,
            score,
            rewards,
        });
    }

    fromServerClaim(definition, claim, { sessionId = claim?.event_session_id } = {}) {
        if (!claim?.id || !Array.isArray(claim.rewards)) {
            throw new TypeError('A valid server reward claim is required.');
        }
        return createReceipt({
            id: `server:${claim.id}`,
            eventId: claim.event_id ?? definition.id,
            sessionId,
            successful: claim.successful,
            score: claim.score,
            rewards: claim.rewards,
        });
    }
}
