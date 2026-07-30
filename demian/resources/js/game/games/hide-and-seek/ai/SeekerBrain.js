import SearchMemory from './SearchMemory.js';

export const SEEKER_STATES = Object.freeze({
    PATROL: 'patrol',
    SUSPICIOUS: 'suspicious',
    CHASE: 'chase',
    SEARCH: 'search',
    CHECK_HIDE_SPOT: 'check-hide-spot',
    RETURN_TO_PATROL: 'return-to-patrol',
});

function nearest(position, candidates) {
    return candidates
        .map((candidate) => ({ candidate, distance: Math.hypot(candidate.position.x - position.x, candidate.position.z - position.z) }))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

export default class SeekerBrain {
    constructor({ patrolPoints = [], memorySeconds = 5.5 } = {}) {
        this.state = SEEKER_STATES.PATROL;
        this.patrolPoints = patrolPoints.map((point) => ({ x: point.x, z: point.z }));
        this.patrolIndex = 0;
        this.memory = new SearchMemory({ memorySeconds });
        this.currentTargetId = null;
        this.currentTarget = null;
        this.time = 0;
    }

    update(deltaTime, { self, visibleHiders = [], hideSpots = [], seeking = false } = {}) {
        this.time += Math.max(0, Number(deltaTime) || 0);
        this.memory.prune(this.time);
        if (!seeking) return this.intent(SEEKER_STATES.PATROL, self.position, null);

        const visible = nearest(self.position, visibleHiders.filter((hider) => !hider.eliminated));
        if (visible) {
            this.state = SEEKER_STATES.CHASE;
            this.currentTargetId = visible.candidate.id;
            this.currentTarget = { ...visible.candidate.position };
            this.memory.rememberSeen(visible.candidate.id, visible.candidate.position, this.time);
            return this.intent(this.state, this.currentTarget, this.currentTargetId);
        }

        const recent = this.memory.recentSeen(this.time)[0];
        if (recent) {
            this.state = SEEKER_STATES.SEARCH;
            this.currentTargetId = recent.actorId;
            this.currentTarget = { ...recent.position };
            return this.intent(this.state, this.currentTarget, this.currentTargetId);
        }

        const unchecked = hideSpots
            .filter((spot) => this.memory.shouldCheckSpot(spot.id, this.time))
            .map((spot) => ({ ...spot, distance: Math.hypot(spot.position.x - self.position.x, spot.position.z - self.position.z) }))
            .sort((a, b) => a.distance - b.distance)[0];
        if (unchecked && unchecked.distance < 8.5) {
            this.state = SEEKER_STATES.CHECK_HIDE_SPOT;
            this.currentTargetId = unchecked.id;
            this.currentTarget = { ...unchecked.position };
            return this.intent(this.state, this.currentTarget, unchecked.id, unchecked.distance < (unchecked.radius ?? 1) + 1.15 ? 'check-hide-spot' : null);
        }

        this.state = SEEKER_STATES.PATROL;
        const target = this.patrolPoints[this.patrolIndex % Math.max(1, this.patrolPoints.length)] ?? self.position;
        if (Math.hypot(target.x - self.position.x, target.z - self.position.z) < 0.7) {
            this.patrolIndex = (this.patrolIndex + 1) % Math.max(1, this.patrolPoints.length);
        }
        this.currentTarget = { ...(this.patrolPoints[this.patrolIndex] ?? target) };
        return this.intent(this.state, this.currentTarget, null);
    }

    markSpotChecked(spotId) {
        this.memory.markHideSpotChecked(spotId, this.time);
    }

    intent(state, target, targetId, action = null) {
        return Object.freeze({ state, target: { x: target.x, z: target.z }, targetId, action });
    }
}
