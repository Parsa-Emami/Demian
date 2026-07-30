export const TETRIS_STATES = Object.freeze({
    IDLE: 'idle',
    PLAYING: 'playing',
    GAME_OVER: 'game-over',
});

export default class TetrisState {
    constructor() {
        this.value = TETRIS_STATES.IDLE;
    }

    set(next) {
        if (!Object.values(TETRIS_STATES).includes(next)) {
            throw new Error(`Unknown Tetris state: ${next}`);
        }
        this.value = next;
        return this.value;
    }

    is(state) {
        return this.value === state;
    }
}
