export default class ScoreSystem {
    constructor(config = {}) {
        this.config = config;
        this.reset();
    }

    reset() {
        this.scores = new Map();
        this.stats = new Map();
    }

    ensure(actorId) {
        const id = String(actorId);
        if (!this.scores.has(id)) this.scores.set(id, 0);
        if (!this.stats.has(id)) this.stats.set(id, { tags: 0, hiddenSeconds: 0, survivalSeconds: 0, escapes: 0 });
        return id;
    }

    tick(actor, deltaTime, { seeking = false } = {}) {
        const id = this.ensure(actor.id);
        if (!seeking || actor.eliminated || actor.role !== 'hider') return;
        const dt = Math.max(0, Number(deltaTime) || 0);
        const stats = this.stats.get(id);
        stats.survivalSeconds += dt;
        if (actor.hidden) stats.hiddenSeconds += dt;
        const points = dt * (Number(this.config.survivalPerSecond) || 0) + (actor.hidden ? dt * (Number(this.config.hiddenPerSecond) || 0) : 0);
        this.scores.set(id, this.scores.get(id) + points);
    }

    awardTag(actorId, remainingSeconds = 0) {
        const id = this.ensure(actorId);
        const stats = this.stats.get(id);
        stats.tags += 1;
        const points = (Number(this.config.seekerTag) || 0) + Math.max(0, remainingSeconds) * (Number(this.config.seekerFastTagBonusPerSecond) || 0);
        this.scores.set(id, this.scores.get(id) + points);
        return points;
    }

    awardWin(actorId, role) {
        const id = this.ensure(actorId);
        const points = role === 'seeker' ? Number(this.config.seekerWin) || 0 : Number(this.config.hiderWin) || 0;
        this.scores.set(id, this.scores.get(id) + points);
        return points;
    }

    awardEscape(actorId) {
        const id = this.ensure(actorId);
        this.stats.get(id).escapes += 1;
        const points = Number(this.config.escapeBonus) || 0;
        this.scores.set(id, this.scores.get(id) + points);
        return points;
    }

    score(actorId) {
        return Math.round(this.scores.get(String(actorId)) ?? 0);
    }

    snapshot(actorId) {
        const id = this.ensure(actorId);
        return Object.freeze({ score: this.score(id), ...this.stats.get(id) });
    }
}
