export default class MobilePerformanceManager {
    constructor() {
        this.frame = null;
        this.queueViewportUpdate = this.queueViewportUpdate.bind(this);
    }

    mount() {
        this.updateViewport();
        window.addEventListener('resize', this.queueViewportUpdate, { passive: true });
        window.visualViewport?.addEventListener('resize', this.queueViewportUpdate, { passive: true });
        window.addEventListener('pageshow', this.queueViewportUpdate, { passive: true });
    }

    queueViewportUpdate() {
        if (this.frame !== null) return;
        this.frame = window.requestAnimationFrame(() => {
            this.frame = null;
            this.updateViewport();
        });
    }

    updateViewport() {
        const viewport = window.visualViewport;
        const fit = Math.abs((viewport?.scale ?? 1) - 1) < .01;
        const height = Math.round(fit ? (viewport?.height || window.innerHeight) : window.innerHeight);
        const width = Math.round(fit ? (viewport?.width || window.innerWidth) : window.innerWidth);
        if (height <= 0 || width <= 0 || (this.height === height && this.width === width)) return;

        const style = document.documentElement.style;
        style.setProperty('--demian-vh', `${height / 100}px`);
        style.setProperty('--demian-vw', `${width / 100}px`);
        style.setProperty('--demian-real-height', `${height}px`);
        this.height = height;
        this.width = width;
    }
}
