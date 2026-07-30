import BaseScreen from './BaseScreen';

export default class LoadingScreen extends BaseScreen {
    constructor(options) {
        super(options);
        this.title = this.element.querySelector('[data-loading-title]');
        this.step = this.element.querySelector('[data-loading-step]');
        this.bar = this.element.querySelector('[data-loading-progress-bar]');
        this.value = this.element.querySelector('[data-loading-progress-value]');
    }

    async beforeOpen(payload) {
        if (this.title) this.title.textContent = payload.title ?? 'LOADING';
        this.setProgress(payload.progress ?? 8, payload.step ?? 'در حال آماده‌سازی بازی…');
    }

    setProgress(progress, step) {
        const safe = Math.min(100, Math.max(0, Number(progress) || 0));
        this.bar?.style.setProperty('--loading-progress', `${safe}%`);
        if (this.value) this.value.textContent = `${Math.round(safe)}%`;
        if (step && this.step) this.step.textContent = step;
    }
}
