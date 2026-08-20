/**
 * Demian mobile performance layer.
 * Fixes viewport sizing on mobile browsers and applies adaptive rendering
 * quality without sacrificing character animation smoothness.
 */
export default class MobilePerformanceManager {
    constructor() {
        this.lastHeight = 0;
        this.raf = null;
    }

    mount() {
        this.updateViewport();
        window.addEventListener('resize', () => this.updateViewport(), { passive: true });
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.updateViewport(), 120);
        }, { passive: true });
        this.enableSmoothCanvas();
    }

    updateViewport() {
        const vv = window.visualViewport;
        const height = vv?.height || window.innerHeight;
        const width = vv?.width || window.innerWidth;
        if (!height || !width) return;

        document.documentElement.style.setProperty('--demian-vh', `${height / 100}px`);
        document.documentElement.style.setProperty('--demian-vw', `${width / 100}px`);
        document.documentElement.style.setProperty('--demian-real-height', `${height}px`);
        this.lastHeight = height;
    }

    enableSmoothCanvas() {
        document.querySelectorAll('canvas[data-game-canvas]').forEach((canvas) => {
            canvas.style.imageRendering = 'auto';
            canvas.style.transform = 'translateZ(0)';
            canvas.style.backfaceVisibility = 'hidden';
        });
    }
}
