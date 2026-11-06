import rules from '../../../../game/runner-rules.json' with { type: 'json' };

export function runnerInputMask(input = {}) {
    return (input.jump ? 1 : 0) | (input.jumpHeld ? 2 : 0) | (input.duck || input.slide ? 4 : 0);
}

export function runnerInputFromMask(mask) {
    return { jump: Boolean(mask & 1), jumpHeld: Boolean(mask & 2), duck: Boolean(mask & 4) };
}

export default class RunnerReplay {
    constructor() { this.ticks = 0; this.transitions = []; this.mask = -1; this.valid = true; }
    record(input) {
        const mask = runnerInputMask(input);
        if (mask !== this.mask) {
            if (this.transitions.length >= rules.maxTransitions) this.valid = false;
            else this.transitions.push({ tick: this.ticks, mask });
            this.mask = mask;
        }
        this.ticks += 1;
        if (this.ticks > rules.maxTicks) this.valid = false;
    }
    payload() { return { ticks: this.ticks, transitions: this.transitions.map(entry => ({ ...entry })) }; }
}
