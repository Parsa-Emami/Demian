import BaseScreen from './BaseScreen';

export default class BootScreen extends BaseScreen {
    constructor(options) {
        super(options);
        this.bar = this.element.querySelector('[data-boot-progress-bar]');
        this.value = this.element.querySelector('[data-boot-progress-value]');
        this.message = this.element.querySelector('[data-boot-message]');
    }

    setProgress(progress, message = null) {
        const safe = Math.min(100, Math.max(0, Number(progress) || 0));
        this.bar?.style.setProperty('--boot-progress', `${safe}%`);
        if (this.value) this.value.textContent = `${Math.round(safe)}%`;
        if (message && this.message) this.message.textContent = message;
    }

    async beforeOpen(payload) {
        this.setProgress(payload.progress ?? 0, payload.message ?? 'در حال راه‌اندازی هسته‌ی دمیان…');
    }
}
