export const RENDER_PROFILES = Object.freeze({
    performance: Object.freeze({ quality: 'performance', maxWidth: 1024, maxTiles: 8, concurrency: 1, maxPixelRatio: 1, pixelBudget: 1000000 }),
    balanced: Object.freeze({ quality: 'balanced', maxWidth: 1536, maxTiles: 12, concurrency: 2, maxPixelRatio: 1.35, pixelBudget: 1250000 }),
    high: Object.freeze({ quality: 'high', maxWidth: 2048, maxTiles: 20, concurrency: 3, maxPixelRatio: 1.75, pixelBudget: 2200000 }),
});

const LEVELS = [
    Object.freeze({ ...RENDER_PROFILES.performance, maxPixelRatio: .8, pixelBudget: 650000 }),
    RENDER_PROFILES.performance,
    RENDER_PROFILES.balanced,
    RENDER_PROFILES.high,
];

export function renderQualityProfile(preference = 'auto', detected = 'balanced') {
    return RENDER_PROFILES[preference] ?? RENDER_PROFILES[detected] ?? RENDER_PROFILES.balanced;
}

export default class RenderQuality {
    constructor(detected) {
        this.ceiling = LEVELS.indexOf(renderQualityProfile('auto', detected));
        this.setPreference('auto');
    }

    setPreference(preference) {
        if (this.preference === preference) return false;
        this.preference = preference;
        this.level = preference === 'auto' ? this.ceiling : LEVELS.indexOf(renderQualityProfile(preference));
        this.resetMeasurements();
        return true;
    }

    get profile() { return LEVELS[this.level]; }
    get economical() { return this.level === 0; }

    resetMeasurements() {
        this.duration = 0;
        this.samples = 0;
        this.slow = 0;
        this.stableWindows = 0;
    }

    observe(seconds) {
        if (this.preference !== 'auto' || !Number.isFinite(seconds) || seconds <= 0) return false;
        if (seconds > .25) {
            this.resetMeasurements();
            return false;
        }

        this.duration += seconds;
        this.samples++;
        if (seconds > .023) this.slow++;
        if (this.duration < 2) return false;

        const slowShare = this.slow / this.samples;
        this.stableWindows = slowShare < .05 && this.duration / this.samples <= .018 ? this.stableWindows + 1 : 0;
        this.duration = 0;
        this.samples = 0;
        this.slow = 0;

        if (slowShare >= .25 && this.level > 0) {
            this.level--;
            return true;
        }
        if (this.stableWindows >= 4 && this.level < this.ceiling) {
            this.level++;
            this.stableWindows = 0;
            return true;
        }
        return false;
    }
}
