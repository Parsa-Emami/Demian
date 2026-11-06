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
        this.ranking = this.element.querySelector('[data-results-ranking]');
        this.retryRanking = this.element.querySelector('[data-results-ranking-retry]');
    }

    async beforeOpen(payload) {
        this.payload = payload ?? {};
        const current = this.payload;
        if (this.ranking) this.ranking.textContent = payload.ranking ? 'در حال بررسی رکورد…' : '';
        if (this.retryRanking) this.retryRanking.hidden = true;
        if (payload.ranking) Promise.resolve(payload.ranking).then(result => {
            if (this.payload === current) this.renderRanking(result);
        }).catch(() => { if (this.payload === current) this.renderRanking({ status: 'pending', retryable: true }); });
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

    renderRanking(result = {}) {
        const messages = { verified: 'رکورد توسط سرور تأیید و در لیدربورد ثبت شد.',
            practice: 'رکورد روی همین دستگاه ذخیره شد.', pending: 'ثبت آنلاین انجام نشد؛ رکورد دستگاه محفوظ است.',
            rejected: 'این دور برای رتبه‌بندی آنلاین پذیرفته نشد؛ رکورد دستگاه محفوظ است.' };
        if (this.ranking) this.ranking.textContent = messages[result.status] ?? '';
        if (this.retryRanking) this.retryRanking.hidden = !result.retryable;
    }
}
