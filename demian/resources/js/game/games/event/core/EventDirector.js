import ModifierSystem from '../modifiers/ModifierSystem.js';
import ObjectiveFactory from '../objectives/ObjectiveFactory.js';
import { EVENT_STATES } from './EventStates.js';

const TRANSITIONS = Object.freeze({
    [EVENT_STATES.IDLE]: [EVENT_STATES.PREPARING],
    [EVENT_STATES.PREPARING]: [EVENT_STATES.COUNTDOWN],
    [EVENT_STATES.COUNTDOWN]: [EVENT_STATES.ACTIVE, EVENT_STATES.FAILED],
    [EVENT_STATES.ACTIVE]: [EVENT_STATES.SUCCESS, EVENT_STATES.FAILED],
    [EVENT_STATES.SUCCESS]: [EVENT_STATES.REWARD],
    [EVENT_STATES.FAILED]: [EVENT_STATES.REWARD],
    [EVENT_STATES.REWARD]: [EVENT_STATES.RESULTS],
    [EVENT_STATES.RESULTS]: [EVENT_STATES.PREPARING],
    [EVENT_STATES.DISPOSED]: [],
});

function freezeEvent(value) {
    return Object.freeze(value);
}

function createEventLedger() {
    return {
        collect: new Map(),
        reach: new Set(),
        defeat: new Map(),
        score: 0,
    };
}

/**
 * Deterministic state machine for every data-driven event.
 *
 * The director does not know about DOM, Three.js, Laravel or a concrete map.
 * It consumes semantic gameplay events and advances objective state.
 */
export default class EventDirector {
    constructor({
        objectiveFactory = new ObjectiveFactory(),
        modifierSystem = new ModifierSystem(),
        onEvent = null,
        outcomeDelay = 0.7,
    } = {}) {
        this.objectiveFactory = objectiveFactory;
        this.modifierSystem = modifierSystem;
        this.onEvent = onEvent;
        this.outcomeDelay = outcomeDelay;
        this.state = EVENT_STATES.IDLE;
        this.definition = null;
        this.objectives = [];
        this.elapsed = 0;
        this.remaining = 0;
        this.countdown = 0;
        this.outcomeElapsed = 0;
        this.sessionId = null;
        this.seed = null;
        this.failureReason = null;
        this.rewardReceipt = null;
        this.eventLedger = createEventLedger();
    }

    transition(next, metadata = {}) {
        if (!TRANSITIONS[this.state]?.includes(next)) {
            throw new Error(`Invalid event transition: ${this.state} -> ${next}`);
        }

        const previous = this.state;
        this.state = next;
        this.onEvent?.(freezeEvent({ type: 'state', previous, state: next, metadata }));
        return this.state;
    }

    prepare(definition, {
        sessionId = `${definition.id}-${Date.now()}`,
        seed = sessionId,
    } = {}) {
        if (this.state === EVENT_STATES.DISPOSED) {
            throw new Error('Disposed EventDirector cannot prepare.');
        }
        if (![EVENT_STATES.IDLE, EVENT_STATES.RESULTS].includes(this.state)) {
            this.reset();
        }

        this.definition = definition;
        this.objectives = definition.objectives.map((item) => this.objectiveFactory.create(item));
        this.elapsed = 0;
        this.remaining = definition.duration;
        this.countdown = definition.countdown ?? 3;
        this.outcomeElapsed = 0;
        this.sessionId = sessionId;
        this.seed = seed;
        this.failureReason = null;
        this.rewardReceipt = null;
        this.eventLedger = createEventLedger();
        this.modifierSystem.apply(definition.modifiers);
        this.transition(EVENT_STATES.PREPARING);
        return this.snapshot();
    }

    start() {
        if (this.state !== EVENT_STATES.PREPARING) {
            throw new Error('Event must be prepared before start.');
        }
        this.transition(EVENT_STATES.COUNTDOWN);
        if (this.countdown <= 0) this.beginActive();
        return this.snapshot();
    }

    beginActive() {
        if (this.state !== EVENT_STATES.COUNTDOWN) return;
        this.transition(EVENT_STATES.ACTIVE);
        this.refreshObjectives();
    }

    refreshObjectives() {
        let progressed = true;
        while (progressed) {
            progressed = false;
            const completed = new Set(
                this.objectives.filter((objective) => objective.completed).map((objective) => objective.id)
            );

            for (const objective of this.objectives) {
                if (objective.status !== 'locked' || !objective.canActivate(completed)) continue;
                objective.activate();
                progressed = true;
                if (this.hydrateObjective(objective)) this.emitObjectiveCompleted(objective);
            }
        }
    }

    recordEvent(event) {
        if (event.type === 'collect') {
            const current = this.eventLedger.collect.get(event.item) ?? 0;
            this.eventLedger.collect.set(event.item, current + Math.max(1, Number(event.amount) || 1));
        } else if (event.type === 'reach') {
            this.eventLedger.reach.add(event.zone);
        } else if (event.type === 'defeat') {
            const current = this.eventLedger.defeat.get(event.enemy) ?? 0;
            this.eventLedger.defeat.set(event.enemy, current + Math.max(1, Number(event.amount) || 1));
        } else if (event.type === 'score') {
            this.eventLedger.score = Math.max(
                this.eventLedger.score,
                Math.max(0, Number(event.total) || 0)
            );
        }
    }

    hydrateObjective(objective) {
        if (objective.type === 'collect') {
            const amount = this.eventLedger.collect.get(objective.item) ?? 0;
            if (amount > 0) objective.apply({ type: 'collect', item: objective.item, amount });
        } else if (objective.type === 'reach' && this.eventLedger.reach.has(objective.zone)) {
            objective.apply({ type: 'reach', zone: objective.zone });
        } else if (objective.type === 'defeat') {
            const amount = this.eventLedger.defeat.get(objective.enemy) ?? 0;
            if (amount > 0) objective.apply({ type: 'defeat', enemy: objective.enemy, amount });
        } else if (objective.type === 'score') {
            objective.apply({ type: 'score', total: this.eventLedger.score });
        }
        return objective.completed;
    }

    emitObjectiveCompleted(objective) {
        this.onEvent?.(freezeEvent({
            type: 'objective-completed',
            objective: objective.snapshot(),
        }));
    }

    dispatch(event) {
        if (this.state !== EVENT_STATES.ACTIVE) return false;
        this.recordEvent(event);
        let changed = false;

        for (const objective of this.objectives) {
            if (!objective.apply(event)) continue;
            changed = true;
            if (objective.completed) this.emitObjectiveCompleted(objective);
        }

        if (changed) {
            this.refreshObjectives();
            this.evaluateCompletion();
        }
        return changed;
    }

    fixedUpdate(deltaTime) {
        const dt = Math.max(0, Math.min(0.25, Number(deltaTime) || 0));

        if (this.state === EVENT_STATES.COUNTDOWN) {
            this.countdown = Math.max(0, this.countdown - dt);
            if (this.countdown <= 0) this.beginActive();
        } else if (this.state === EVENT_STATES.ACTIVE) {
            this.elapsed += dt;
            this.remaining = Math.max(0, this.definition.duration - this.elapsed);
            let changed = false;

            for (const objective of this.objectives) {
                if (!objective.update(dt)) continue;
                changed = true;
                if (objective.completed) this.emitObjectiveCompleted(objective);
            }

            if (changed) this.refreshObjectives();
            this.evaluateCompletion();
            if (this.state === EVENT_STATES.ACTIVE && this.remaining <= 0) {
                this.fail('time-expired');
            }
        } else if ([EVENT_STATES.SUCCESS, EVENT_STATES.FAILED].includes(this.state)) {
            this.outcomeElapsed += dt;
            if (this.outcomeElapsed >= this.outcomeDelay) this.transition(EVENT_STATES.REWARD);
        }

        return this.snapshot();
    }

    evaluateCompletion() {
        if (
            this.state === EVENT_STATES.ACTIVE
            && this.objectives.length > 0
            && this.objectives.filter((objective) => objective.required).every((objective) => objective.completed)
        ) {
            this.succeed();
        }
    }

    succeed() {
        if (this.state !== EVENT_STATES.ACTIVE) return false;
        this.remaining = Math.max(0, this.remaining);
        this.transition(EVENT_STATES.SUCCESS);
        return true;
    }

    fail(reason = 'failed') {
        if (![EVENT_STATES.ACTIVE, EVENT_STATES.COUNTDOWN].includes(this.state)) return false;
        this.failureReason = reason;
        this.objectives.forEach((objective) => {
            if (!objective.completed) objective.fail();
        });
        this.transition(EVENT_STATES.FAILED, { reason });
        return true;
    }

    acceptRewards(receipt) {
        if (this.state !== EVENT_STATES.REWARD) {
            throw new Error('Rewards can only be accepted in reward state.');
        }
        this.rewardReceipt = receipt;
        this.transition(EVENT_STATES.RESULTS);
        return this.snapshot();
    }

    snapshot() {
        return freezeEvent({
            state: this.state,
            eventId: this.definition?.id ?? null,
            title: this.definition?.title ?? null,
            sessionId: this.sessionId,
            seed: this.seed,
            elapsed: this.elapsed,
            remaining: this.remaining,
            countdown: this.countdown,
            failureReason: this.failureReason,
            objectives: Object.freeze(this.objectives.map((objective) => objective.snapshot())),
            modifiers: this.modifierSystem.snapshot(),
            rewardReceipt: this.rewardReceipt,
            successful: [EVENT_STATES.SUCCESS, EVENT_STATES.REWARD, EVENT_STATES.RESULTS]
                .includes(this.state) && !this.failureReason,
        });
    }

    reset() {
        this.modifierSystem.reset();
        this.state = EVENT_STATES.IDLE;
        this.definition = null;
        this.objectives = [];
        this.elapsed = 0;
        this.remaining = 0;
        this.countdown = 0;
        this.outcomeElapsed = 0;
        this.sessionId = null;
        this.failureReason = null;
        this.rewardReceipt = null;
        this.eventLedger = createEventLedger();
    }

    dispose() {
        this.modifierSystem.dispose();
        this.state = EVENT_STATES.DISPOSED;
        this.definition = null;
        this.objectives = [];
        this.eventLedger = createEventLedger();
    }
}
