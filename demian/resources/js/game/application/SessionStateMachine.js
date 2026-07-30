export const SESSION_STATES = Object.freeze({
    BOOTING: 'booting',
    MENU: 'menu',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    RESULTS: 'results',
    DISPOSED: 'disposed',
});

const TRANSITIONS = Object.freeze({
    [SESSION_STATES.BOOTING]: new Set([SESSION_STATES.MENU, SESSION_STATES.LOADING, SESSION_STATES.DISPOSED]),
    [SESSION_STATES.MENU]: new Set([SESSION_STATES.LOADING, SESSION_STATES.PLAYING, SESSION_STATES.DISPOSED]),
    [SESSION_STATES.LOADING]: new Set([SESSION_STATES.MENU, SESSION_STATES.PLAYING, SESSION_STATES.DISPOSED]),
    [SESSION_STATES.PLAYING]: new Set([
        SESSION_STATES.PAUSED,
        SESSION_STATES.RESULTS,
        SESSION_STATES.LOADING,
        SESSION_STATES.MENU,
        SESSION_STATES.DISPOSED,
    ]),
    [SESSION_STATES.PAUSED]: new Set([
        SESSION_STATES.PLAYING,
        SESSION_STATES.LOADING,
        SESSION_STATES.MENU,
        SESSION_STATES.RESULTS,
        SESSION_STATES.DISPOSED,
    ]),
    [SESSION_STATES.RESULTS]: new Set([
        SESSION_STATES.LOADING,
        SESSION_STATES.MENU,
        SESSION_STATES.DISPOSED,
    ]),
    [SESSION_STATES.DISPOSED]: new Set(),
});

/**
 * Pure application-session state machine. UI screens and loaded game instances
 * are deliberately separate concerns and react to these transitions.
 */
export default class SessionStateMachine {
    constructor({ initial = SESSION_STATES.BOOTING, eventBus = null } = {}) {
        if (!TRANSITIONS[initial]) {
            throw new Error(`Unknown initial session state "${initial}".`);
        }
        this.state = initial;
        this.eventBus = eventBus;
        this.history = [Object.freeze({ from: null, to: initial, metadata: Object.freeze({}) })];
    }

    canTransition(next) {
        return next === this.state || Boolean(TRANSITIONS[this.state]?.has(next));
    }

    transition(next, metadata = {}) {
        if (!TRANSITIONS[next]) {
            throw new Error(`Unknown session state "${next}".`);
        }
        if (next === this.state) {
            return this.state;
        }
        if (!this.canTransition(next)) {
            throw new Error(`Invalid session transition: ${this.state} -> ${next}.`);
        }

        const from = this.state;
        this.state = next;
        const change = Object.freeze({
            from,
            to: next,
            metadata: Object.freeze({ ...metadata }),
        });
        this.history.push(change);
        this.eventBus?.emit('session:changed', change);
        return this.state;
    }
}
