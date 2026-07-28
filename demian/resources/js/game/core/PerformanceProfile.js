export default class PerformanceProfile {
    constructor(renderer) {
        const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        const memory = Number(navigator.deviceMemory ?? 4);
        const cores = Number(navigator.hardwareConcurrency ?? 4);
        const maxTextureSize = renderer.capabilities.maxTextureSize;
        const narrowScreen = Math.min(window.innerWidth, window.innerHeight) < 720;

        const constrained =
            reducedMotion ||
            memory <= 3 ||
            cores <= 4 ||
            maxTextureSize < 4096;

        const balanced =
            !constrained &&
            (coarsePointer || narrowScreen || memory < 8 || cores < 8);

        this.tier = constrained ? 'performance' : balanced ? 'balanced' : 'high';
        this.coarsePointer = coarsePointer;
        this.reducedMotion = reducedMotion;
        this.maxTextureSize = maxTextureSize;
        this.maxPixelRatio = this.tier === 'performance' ? 1 : this.tier === 'balanced' ? 1.35 : 1.75;
        this.minimumPixelRatio = this.tier === 'performance' ? 0.72 : 0.82;
        this.npcCount = this.tier === 'performance' ? 2 : this.tier === 'balanced' ? 3 : 5;
        this.decorDensity = this.tier === 'performance' ? 0.55 : this.tier === 'balanced' ? 0.78 : 1;
        this.useHighResolutionSprites = maxTextureSize >= 4096 && this.tier === 'high';
        this.useCompactSprites = maxTextureSize < 2880 || this.tier === 'performance';
        this.targetFps = this.tier === 'performance' ? 50 : 60;
    }

    spriteVariant() {
        if (this.useCompactSprites) {
            return 'compact';
        }

        return this.useHighResolutionSprites ? 'desktop' : 'mobile';
    }
}
