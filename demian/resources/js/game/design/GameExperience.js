import design from '../../../game/game-design-standard-v1.json' with { type: 'json' };
import briefing from '../../../game/game-design-briefing-v1.json' with { type: 'json' };

// Shared read-only game-design contract. This module describes the existing
// games; it never changes ranked physics, API requests or financial settings.
const designById = new Map(design.games.map(game => [game.id, game]));
const guides = new Map(briefing.games.map(entry => {
    const original = designById.get(entry.id);
    if (!original) return [entry.id, null];
    return [entry.id, Object.freeze({
        ...entry,
        loop: Object.freeze([...original.loop]),
        session: Object.freeze({ ...original.session }),
        skill: original.skill,
        competitive: original.competitive,
    })];
}));

export const GAME_EXPERIENCE_IDS = Object.freeze([...guides.keys()]);

export function gameExperience(gameId) {
    return guides.get(String(gameId ?? '')) ?? null;
}

export function gameOutcomeHint(gameId, { success = false } = {}) {
    const guide = gameExperience(gameId);
    if (!guide) return '';
    return success ? guide.retryTipFa : guide.failureTipFa;
}

// This classification is deliberately informational. Even 'ranked' cannot
// promote a local result: the authoritative server/replay path owns that.
export function gameModeExplanation(gameId, mode = 'practice') {
    const guide = gameExperience(gameId);
    if (!guide) return '';
    return mode === 'ranked' ? guide.modes.rankedFa : guide.modes.practiceFa;
}
