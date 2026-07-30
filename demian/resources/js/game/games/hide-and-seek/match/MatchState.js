export const MATCH_STATES = Object.freeze({
    IDLE: 'idle',
    LOBBY: 'lobby',
    ROLE_REVEAL: 'role-reveal',
    HIDING_COUNTDOWN: 'hiding-countdown',
    SEEKING: 'seeking',
    ROUND_END: 'round-end',
    RESULTS: 'results',
});

export const MATCH_ROLES = Object.freeze({
    HIDER: 'hider',
    SEEKER: 'seeker',
    SPECTATOR: 'spectator',
    ELIMINATED: 'eliminated',
});

export const MATCH_WINNERS = Object.freeze({
    HIDERS: 'hiders',
    SEEKER: 'seeker',
    NONE: null,
});
