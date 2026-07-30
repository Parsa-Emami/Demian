function hashSeed(value) {
    let hash = 2166136261;
    const text = String(value ?? 'demian');
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export default class RoleAssigner {
    constructor(seed = 'demian-hide-and-seek') {
        this.seed = seed;
    }

    assign(participantIds, { requestedPlayerRole = null, playerId = 'player' } = {}) {
        const ids = [...new Set(participantIds.map(String))];
        if (ids.length < 2) throw new Error('Hide and Seek requires at least two participants.');
        if (!ids.includes(String(playerId))) throw new Error('Player participant is missing.');

        let seekerId;
        if (requestedPlayerRole === 'seeker') seekerId = String(playerId);
        else if (requestedPlayerRole === 'hider') {
            const candidates = ids.filter((id) => id !== String(playerId));
            seekerId = candidates[hashSeed(this.seed) % candidates.length];
        } else {
            seekerId = ids[hashSeed(this.seed) % ids.length];
        }

        const roles = new Map(ids.map((id) => [id, id === seekerId ? 'seeker' : 'hider']));
        return Object.freeze({ seekerId, roles });
    }
}
