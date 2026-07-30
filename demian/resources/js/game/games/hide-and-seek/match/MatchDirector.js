import RoundTimer from './RoundTimer.js';
import RoleAssigner from './RoleAssigner.js';
import { MATCH_ROLES, MATCH_STATES, MATCH_WINNERS } from './MatchState.js';

const TRANSITIONS = Object.freeze({
    [MATCH_STATES.IDLE]: new Set([MATCH_STATES.LOBBY]),
    [MATCH_STATES.LOBBY]: new Set([MATCH_STATES.ROLE_REVEAL]),
    [MATCH_STATES.ROLE_REVEAL]: new Set([MATCH_STATES.HIDING_COUNTDOWN]),
    [MATCH_STATES.HIDING_COUNTDOWN]: new Set([MATCH_STATES.SEEKING]),
    [MATCH_STATES.SEEKING]: new Set([MATCH_STATES.ROUND_END]),
    [MATCH_STATES.ROUND_END]: new Set([MATCH_STATES.RESULTS]),
    [MATCH_STATES.RESULTS]: new Set([MATCH_STATES.LOBBY]),
});

export default class MatchDirector {
    constructor({ config, onEvent = null } = {}) {
        if (!config?.phases) throw new TypeError('MatchDirector requires phase configuration.');
        this.config = config;
        this.onEvent = onEvent;
        this.state = MATCH_STATES.IDLE;
        this.timer = new RoundTimer();
        this.participants = new Map();
        this.seekerId = null;
        this.winner = MATCH_WINNERS.NONE;
        this.reason = null;
        this.tick = 0;
        this.seed = null;
    }

    start({ participantIds, playerId = 'player', requestedPlayerRole = null, seed = Date.now() } = {}) {
        this.seed = String(seed);
        const assignment = new RoleAssigner(this.seed).assign(participantIds, {
            requestedPlayerRole,
            playerId,
        });
        this.participants = new Map(participantIds.map((id) => [String(id), {
            id: String(id),
            role: assignment.roles.get(String(id)),
            eliminated: false,
            taggedAt: null,
        }]));
        this.seekerId = assignment.seekerId;
        this.winner = MATCH_WINNERS.NONE;
        this.reason = null;
        this.tick = 0;
        this.state = MATCH_STATES.IDLE;
        this.transition(MATCH_STATES.LOBBY);
        this.transition(MATCH_STATES.ROLE_REVEAL, this.config.phases.roleRevealSeconds);
        this.emit('match-started', { seed: this.seed, seekerId: this.seekerId });
        return this.snapshot();
    }

    transition(nextState, duration = 0) {
        if (!TRANSITIONS[this.state]?.has(nextState)) {
            throw new Error(`Invalid match transition: ${this.state} -> ${nextState}`);
        }
        const previous = this.state;
        this.state = nextState;
        this.timer.reset(duration, { running: duration > 0 });
        this.emit('state-changed', { previous, state: nextState, duration });
    }

    update(deltaTime) {
        this.tick += 1;
        this.timer.tick(deltaTime);
        if (!this.timer.expired) return this.snapshot();

        if (this.state === MATCH_STATES.ROLE_REVEAL) {
            this.transition(MATCH_STATES.HIDING_COUNTDOWN, this.config.phases.hidingSeconds);
        } else if (this.state === MATCH_STATES.HIDING_COUNTDOWN) {
            this.transition(MATCH_STATES.SEEKING, this.config.phases.seekingSeconds);
            this.emit('seeking-started', {});
        } else if (this.state === MATCH_STATES.SEEKING) {
            this.finish(MATCH_WINNERS.HIDERS, 'time-expired');
        } else if (this.state === MATCH_STATES.ROUND_END) {
            this.transition(MATCH_STATES.RESULTS, 0);
            this.emit('results-ready', this.snapshot());
        }
        return this.snapshot();
    }

    eliminateHider(participantId, metadata = {}) {
        if (this.state !== MATCH_STATES.SEEKING) return false;
        const participant = this.participants.get(String(participantId));
        if (!participant || participant.role !== MATCH_ROLES.HIDER || participant.eliminated) return false;
        participant.eliminated = true;
        participant.taggedAt = this.config.phases.seekingSeconds - this.timer.remaining;
        this.emit('hider-eliminated', { participantId: participant.id, ...metadata });
        if (this.remainingHiders === 0) this.finish(MATCH_WINNERS.SEEKER, 'all-hiders-tagged');
        return true;
    }

    finish(winner, reason = 'completed') {
        if (![MATCH_STATES.SEEKING, MATCH_STATES.HIDING_COUNTDOWN].includes(this.state)) return false;
        this.winner = winner;
        this.reason = reason;
        this.transition(MATCH_STATES.ROUND_END, this.config.phases.roundEndSeconds);
        this.emit('round-finished', { winner, reason });
        return true;
    }

    roleOf(participantId) {
        return this.participants.get(String(participantId))?.role ?? MATCH_ROLES.SPECTATOR;
    }

    isMovementAllowed(participantId) {
        const role = this.roleOf(participantId);
        if (this.state === MATCH_STATES.HIDING_COUNTDOWN) return role === MATCH_ROLES.HIDER;
        return this.state === MATCH_STATES.SEEKING;
    }

    get remainingHiders() {
        return [...this.participants.values()].filter((participant) =>
            participant.role === MATCH_ROLES.HIDER && !participant.eliminated
        ).length;
    }

    emit(type, payload) {
        this.onEvent?.({ type, state: this.state, tick: this.tick, ...payload });
    }

    snapshot() {
        return Object.freeze({
            state: this.state,
            timer: this.timer.snapshot(),
            seekerId: this.seekerId,
            winner: this.winner,
            reason: this.reason,
            tick: this.tick,
            seed: this.seed,
            remainingHiders: this.remainingHiders,
            participants: Object.freeze([...this.participants.values()].map((entry) => Object.freeze({ ...entry }))),
        });
    }
}
