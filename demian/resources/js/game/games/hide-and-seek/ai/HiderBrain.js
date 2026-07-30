export const HIDER_STATES = Object.freeze({
    CHOOSE_SPOT: 'choose-spot',
    MOVE_TO_SPOT: 'move-to-spot',
    HIDDEN: 'hidden',
    EVADE: 'evade',
    ELIMINATED: 'eliminated',
});

export default class HiderBrain {
    constructor({ preferredSpotIds = [] } = {}) {
        this.state = HIDER_STATES.CHOOSE_SPOT;
        this.preferredSpotIds = [...preferredSpotIds];
        this.targetSpotId = null;
    }

    update(_deltaTime, { self, spots = [], seeker = null, hidingPhase = false, seeking = false } = {}) {
        if (self.eliminated) return this.intent(HIDER_STATES.ELIMINATED, self.position, null, null);
        if (self.hidden) return this.intent(HIDER_STATES.HIDDEN, self.position, self.spotId, null);

        const available = spots.filter((spot) => spot.available);
        if (!this.targetSpotId || !available.some((spot) => spot.id === this.targetSpotId)) {
            const preferred = this.preferredSpotIds.map((id) => available.find((spot) => spot.id === id)).find(Boolean);
            const nearest = [...available].sort((a, b) => {
                const da = Math.hypot(a.position.x - self.position.x, a.position.z - self.position.z);
                const db = Math.hypot(b.position.x - self.position.x, b.position.z - self.position.z);
                return da - db;
            })[0];
            this.targetSpotId = preferred?.id ?? nearest?.id ?? null;
        }

        const targetSpot = available.find((spot) => spot.id === this.targetSpotId);
        if ((hidingPhase || seeking) && targetSpot) {
            const distance = Math.hypot(targetSpot.position.x - self.position.x, targetSpot.position.z - self.position.z);
            this.state = HIDER_STATES.MOVE_TO_SPOT;
            return this.intent(this.state, targetSpot.position, targetSpot.id, distance < (targetSpot.radius ?? 1) + 1.05 ? 'enter-hide-spot' : null);
        }

        if (seeking && seeker) {
            const dx = self.position.x - seeker.position.x;
            const dz = self.position.z - seeker.position.z;
            const length = Math.hypot(dx, dz) || 1;
            this.state = HIDER_STATES.EVADE;
            return this.intent(this.state, { x: self.position.x + dx / length * 5, z: self.position.z + dz / length * 5 }, null, null);
        }

        return this.intent(HIDER_STATES.CHOOSE_SPOT, self.position, null, null);
    }

    intent(state, target, spotId, action) {
        return Object.freeze({ state, target: { x: target.x, z: target.z }, spotId, action });
    }
}
