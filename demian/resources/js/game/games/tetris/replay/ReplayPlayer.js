import { REPLAY_VERSION } from './ReplayRecorder.js';

const MAX_REPLAY_EVENTS = 250_000;

function normalizeEvents(events) {
    if (events.length > MAX_REPLAY_EVENTS) {
        throw new RangeError('Tetris replay contains too many input events.');
    }

    return events.map((event) => {
        const tick = Number(event?.tick);
        if (!Number.isSafeInteger(tick) || tick < 0 || !event?.input || typeof event.input !== 'object') {
            throw new TypeError('Tetris replay contains an invalid input event.');
        }
        return Object.freeze({ tick, input: Object.freeze({ ...event.input }) });
    }).sort((a, b) => a.tick - b.tick);
}

export default class ReplayPlayer {
    constructor(replay) {
        if (!replay || replay.version !== REPLAY_VERSION || !Array.isArray(replay.events)) {
            throw new TypeError('Unsupported or invalid Tetris replay.');
        }

        this.replay = Object.freeze({
            ...replay,
            events: Object.freeze(normalizeEvents(replay.events)),
        });
        this.index = 0;
        this.current = {};
    }

    inputAt(tick) {
        while (this.index < this.replay.events.length && this.replay.events[this.index].tick <= tick) {
            this.current = { ...this.replay.events[this.index].input };
            this.index += 1;
        }
        return { ...this.current };
    }
}
