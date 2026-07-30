export const OBJECTIVE_STATUS = Object.freeze({
    LOCKED: 'locked',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
});

export default class BaseObjective {
    constructor(definition) {
        this.definition = definition;
        this.id = definition.id;
        this.type = definition.type;
        this.title = definition.title ?? definition.id;
        this.requires = Object.freeze([...(definition.requires ?? [])]);
        this.required = definition.required !== false;
        this.points = Math.max(0, Number(definition.points) || 0);
        this.status = this.requires.length
            ? OBJECTIVE_STATUS.LOCKED
            : OBJECTIVE_STATUS.ACTIVE;
        this.current = 0;
        this.target = 1;
    }

    canActivate(completedIds) {
        return this.requires.every((id) => completedIds.has(id));
    }

    activate() {
        if (this.status === OBJECTIVE_STATUS.LOCKED) {
            this.status = OBJECTIVE_STATUS.ACTIVE;
        }
        return this;
    }

    complete() {
        if (this.status === OBJECTIVE_STATUS.COMPLETED) return false;
        this.status = OBJECTIVE_STATUS.COMPLETED;
        this.current = this.target;
        return true;
    }

    fail() {
        if (this.status !== OBJECTIVE_STATUS.COMPLETED) {
            this.status = OBJECTIVE_STATUS.FAILED;
        }
    }

    apply(_event) {
        return false;
    }

    update(_deltaTime) {
        return false;
    }

    get completed() {
        return this.status === OBJECTIVE_STATUS.COMPLETED;
    }

    snapshot() {
        return Object.freeze({
            id: this.id,
            type: this.type,
            title: this.title,
            status: this.status,
            current: this.current,
            target: this.target,
            progress: this.target > 0 ? Math.min(1, this.current / this.target) : 1,
            points: this.points,
            required: this.required,
            requires: this.requires,
        });
    }
}
