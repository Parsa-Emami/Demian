const LINE_POINTS = Object.freeze([0, 100, 300, 500, 800]);
const T_SPIN_POINTS = Object.freeze([400, 800, 1200, 1600]);
const PERFECT_CLEAR_POINTS = Object.freeze([0, 800, 1200, 1800, 2000]);

export default class ScoringSystem {
    constructor() {
        this.reset();
    }

    reset() {
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.combo = -1;
        this.backToBack = false;
        this.lastAward = null;
    }

    addDrop({ soft = 0, hard = 0 } = {}) {
        const points = Math.max(0, soft) + (Math.max(0, hard) * 2);
        this.score += points;
        return points;
    }

    awardLock({ lines = 0, tSpin = false, perfectClear = false } = {}) {
        const clearCount = Math.max(0, Math.min(lines, 4));
        const level = this.level;
        const difficult = clearCount > 0 && (clearCount === 4 || tSpin);
        let base = tSpin ? T_SPIN_POINTS[clearCount] : LINE_POINTS[clearCount];

        if (difficult && this.backToBack) {
            base = Math.floor(base * 1.5);
        }

        if (clearCount > 0) {
            this.combo += 1;
        } else {
            this.combo = -1;
        }

        const comboBonus = clearCount > 0 && this.combo > 0 ? this.combo * 50 : 0;
        const perfectClearBonus = perfectClear ? PERFECT_CLEAR_POINTS[clearCount] : 0;
        const points = (base + comboBonus + perfectClearBonus) * level;

        this.score += points;
        this.lines += clearCount;
        this.level = Math.floor(this.lines / 10) + 1;

        if (difficult) {
            this.backToBack = true;
        } else if (clearCount > 0) {
            this.backToBack = false;
        }

        this.lastAward = Object.freeze({
            points,
            lines: clearCount,
            tSpin,
            perfectClear,
            difficult,
            combo: this.combo,
            backToBack: this.backToBack,
            level: this.level,
        });
        return this.lastAward;
    }

    snapshot() {
        return Object.freeze({
            score: this.score,
            lines: this.lines,
            level: this.level,
            combo: this.combo,
            backToBack: this.backToBack,
            lastAward: this.lastAward,
        });
    }
}
