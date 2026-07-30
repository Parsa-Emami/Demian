export const EVENT_STATES = Object.freeze({
    IDLE: 'idle', PREPARING: 'preparing', COUNTDOWN: 'countdown', ACTIVE: 'active',
    SUCCESS: 'success', FAILED: 'failed', REWARD: 'reward', RESULTS: 'results', DISPOSED: 'disposed',
});

export const EVENT_TERMINAL_STATES = Object.freeze(new Set([
    EVENT_STATES.SUCCESS, EVENT_STATES.FAILED, EVENT_STATES.REWARD, EVENT_STATES.RESULTS,
]));
