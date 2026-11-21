import { formatGameRecord, recordHeading } from '../../leaderboard/GameRecord.js';
import { gameOutcomeHint } from '../../design/GameExperience.js';
import { rankingResultUX } from '../../ui/GameFailureUX.js';
import BaseScreen from './BaseScreen';

const resultValue = (value, digits) => typeof value === 'number'
    ? Number.isFinite(value) ? digits.format(value) : '—'
    : typeof value === 'string' && value.trim() && !/^NaN$/i.test(value.trim()) ? value : '—';

const resultDigits = new Intl.NumberFormat('fa-IR');

export default class ResultsScreen extends BaseScreen {
    constructor(options) {
        super(options);
        this.title = this.element.querySelector('[data-results-title]');
        this.subtitle = this.element.querySelector('[data-results-subtitle]');
        this.score = this.element.querySelector('[data-results-score]');
        this.scoreLabel = this.element.querySelector('[data-results-score-label]');
        this.stats = this.element.querySelector('[data-results-stats]');
        this.replayButton = this.element.querySelector('[data-results-replay]');
        this.payload = null;
        this.ranking = this.element.querySelector('[data-results-ranking]');
        this.retryRanking = this.element.querySelector('[data-results-ranking-retry]');
        this.learningTip = this.element.querySelector('[data-results-learning-tip]');
        this.recordNote = this.element.querySelector('[data-results-record-note]');
        this.rewardNote = this.element.querySelector('[data-results-reward-note]');
    }

    async beforeOpen(payload) {
        this.payload = payload ?? {};
        payload = this.payload;
        const current = this.payload;
        if (this.ranking) this.ranking.textContent = payload.ranking ? 'در حال بررسی رکورد…' : '';
        this.renderRanking({ status: payload.ranking ? 'pending' : 'unknown' });
        if (this.retryRanking) this.retryRanking.hidden = true;
        if (payload.ranking) Promise.resolve(payload.ranking).then(result => {
            if (this.payload === current) this.renderRanking(result);
        }).catch(() => { if (this.payload === current) this.renderRanking({ status: 'pending', retryable: true }); });
        if (this.title) this.title.textContent = payload.title ?? 'نتیجه‌ی بازی';
        if (this.subtitle) this.subtitle.textContent = payload.subtitle ?? 'مرحله به پایان رسید.';
        // Inert, game-specific retry coaching. No unverified score is promoted.
        const tip = gameOutcomeHint(payload.gameId, {
            success: payload.failed !== true && payload.success !== false,
        });
        if (!this.learningTip && this.subtitle?.ownerDocument
            && typeof this.subtitle.after === 'function') {
            this.learningTip = this.subtitle.ownerDocument.createElement('p');
            this.learningTip.className = 'results-learning-tip';
            this.learningTip.dataset.resultsLearningTip = '';
            this.learningTip.setAttribute('role', 'note');
            this.subtitle.after(this.learningTip);
        }
        if (this.learningTip) {
            this.learningTip.hidden = !tip;
            this.learningTip.textContent = tip ? `گام بعدی: ${tip}` : '';
        }
        const record = payload.resultMetric ?? payload.deviceRecord;
        const heading = payload.resultMetricLabel ?? (record ? recordHeading(payload.gameId, 'device') : 'امتیاز');
        if (this.scoreLabel) this.scoreLabel.textContent = heading;
        if (this.score) this.score.textContent = record
            ? formatGameRecord(payload.gameId, record) : resultValue(payload.score, resultDigits);
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
            valueElement.textContent = resultValue(value, resultDigits);
            row.append(labelElement, valueElement);
            this.stats.appendChild(row);
        });
    }

    renderRanking(result = {}) {
        const info = rankingResultUX(result.status);
        if (this.ranking) this.ranking.textContent = result.status === 'unknown'
            ? '' : info.heading;
        if (this.recordNote) this.recordNote.textContent = info.heading;
        if (this.rewardNote) this.rewardNote.textContent = info.detail;
        if (this.retryRanking) this.retryRanking.hidden = result.retryable !== true;
    }
}
