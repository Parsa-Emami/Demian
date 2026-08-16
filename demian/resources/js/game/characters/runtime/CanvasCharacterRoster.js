/**
 * Owns lightweight canvas avatars for non-Three.js game modes.
 *
 * A renderer requests semantic actor slots (player/NPC). The roster resolves
 * them through CharacterVisualService so every mini-game uses the exact same
 * character packs and normalization contract as the open world.
 */
export default class CanvasCharacterRoster {
    constructor(visualService) {
        this.visualService = visualService ?? null;
        this.avatars = new Map();
        this.failures = new Map();
        this.disposed = false;
    }

    async preload(assignments = []) {
        if (!this.visualService || this.disposed) return this;

        await Promise.all(assignments.map(async (assignment, index) => {
            const key = String(assignment?.key ?? assignment?.actorId ?? `actor-${index}`);
            if (this.avatars.has(key)) return;

            try {
                const avatar = await this.visualService.createCanvasAvatar(
                    assignment?.actorId ?? key,
                    {
                        player: Boolean(assignment?.player),
                        index: Number.isFinite(Number(assignment?.index)) ? Number(assignment.index) : index,
                        variant: assignment?.variant ?? null,
                    }
                );
                if (!this.disposed) this.avatars.set(key, avatar);
            } catch (error) {
                if (!this.disposed) this.failures.set(key, error);
            }
        }));

        return this;
    }

    has(key) {
        return this.avatars.has(String(key));
    }

    get(key) {
        return this.avatars.get(String(key)) ?? null;
    }

    sync(key, actor, deltaTime = 0) {
        const avatar = this.get(key);
        avatar?.sync(actor, deltaTime);
        return avatar;
    }

    error(key) {
        return this.failures.get(String(key)) ?? null;
    }

    dispose() {
        this.disposed = true;
        this.avatars.clear();
        this.failures.clear();
        this.visualService = null;
    }
}
