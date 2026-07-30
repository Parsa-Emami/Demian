import BaseScreen from './BaseScreen';

export default class ResultsScreen extends BaseScreen {
    constructor(options) {
        super(options);
        this.title = this.element.querySelector('[data-results-title]');
        this.subtitle = this.element.querySelector('[data-results-subtitle]');
        this.score = this.element.querySelector('[data-results-score]');
        this.stats = this.element.querySelector('[data-results-stats]');
        this.replayButton = this.element.querySelector('[data-results-replay]');
        this.payload = null;
    }

    async beforeOpen(payload) {
        this.payload = payload ?? {};
        if (this.title) this.title.textContent = payload.title ?? 'نتیجه‌ی بازی';
        if (this.subtitle) this.subtitle.textContent = payload.subtitle ?? 'مرحله به پایان رسید.';
        if (this.score) this.score.textContent = String(payload.score ?? 0);
        this.renderStats(payload.stats ?? {});
        if (this.replayButton) {
            this.replayButton.hidden = !payload.replay;
        }
    }

    renderStats(stats) {
        if (!this.stats) return;
        this.stats.replaceChildren();

        Object.entries(stats).forEach(([label, value]) => {
            const row = document.createElement('div');
            const labelElement = document.createElement('span');
            const valueElement = document.createElement('strong');
            labelElement.textContent = String(label);
            valueElement.textContent = String(value);
            row.append(labelElement, valueElement);
            this.stats.appendChild(row);
        });
    }
}
