export const MATCH_COMMANDS = Object.freeze({
    MOVE: 'move',
    INTERACT: 'interact',
    TAG: 'tag',
    ENTER_HIDE_SPOT: 'enter-hide-spot',
    EXIT_HIDE_SPOT: 'exit-hide-spot',
});

const COMMAND_TYPES = new Set(Object.values(MATCH_COMMANDS));

export function validateMatchCommand(command) {
    if (!command || typeof command !== 'object') return false;
    if (!COMMAND_TYPES.has(command.type)) return false;
    if (!Number.isInteger(command.tick) || command.tick < 0) return false;
    if (!command.actorId || typeof command.actorId !== 'string') return false;
    return true;
}

export function createMatchSnapshot({ tick, state, timer, participants, winner = null, reason = null }) {
    return Object.freeze({
        version: 1,
        tick: Math.max(0, Number(tick) || 0),
        state,
        timer: timer?.snapshot?.() ?? timer,
        participants: Object.freeze(participants.map((participant) => Object.freeze({
            id: participant.id,
            role: participant.role,
            eliminated: Boolean(participant.eliminated),
            hidden: Boolean(participant.hidden),
            spotId: participant.spotId ?? null,
            position: Object.freeze({ x: participant.position.x, z: participant.position.z }),
        }))),
        winner,
        reason,
    });
}
