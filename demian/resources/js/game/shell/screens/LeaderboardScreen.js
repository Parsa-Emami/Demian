import BaseScreen from './BaseScreen.js';

export default class LeaderboardScreen extends BaseScreen {
    constructor({ service, ...options }) {
        super({ ...options, layer: 'modal' });
        this.service = service; this.generation = 0;
        this.period = this.element.querySelector('[data-ranking-period]');
        this.body = this.element.querySelector('[data-ranking-rows]');
        this.status = this.element.querySelector('[data-ranking-status]');
        this.form = this.element.querySelector('[data-ranking-name-form]');
        this.onPeriod = () => this.load();
        this.onSubmit = async (event) => {
            event.preventDefault();
            const button = this.form.querySelector('button'); button.disabled = true;
            try { await this.service.rename(this.form.elements.display_name.value); this.status.textContent = 'نام نمایشی ذخیره شد.'; }
            catch (error) { this.status.textContent = error.message; }
            finally { button.disabled = false; }
        };
        this.period.addEventListener('change', this.onPeriod);
        this.form.addEventListener('submit', this.onSubmit);
    }
    async beforeOpen() {
        this.form.elements.display_name.value = this.service.displayName;
        for (const option of this.period.options) option.disabled = !this.service.connected && option.value !== 'device';
        this.period.value = this.service.connected ? 'all' : 'device'; this.load();
    }
    async load() {
        const generation = ++this.generation;
        this.status.textContent = 'در حال خواندن رکوردها…'; this.body.replaceChildren();
        try {
            const result = await this.service.list(this.period.value);
            if (generation !== this.generation) return;
            this.status.textContent = result.mode === 'device' ? 'رکوردهای همین مرورگر؛ ثبت جهانی نشده‌اند.'
                : 'امتیازهای تأییدشده توسط سرور · روز و هفته بر اساس UTC';
            if (!result.data.length) this.status.textContent += ' هنوز رکوردی ثبت نشده است.';
            for (const row of result.data) {
                const tr = document.createElement('tr');
                for (const value of [row.rank, row.display_name, row.score]) {
                    const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
                }
                this.body.append(tr);
            }
        } catch {
            if (generation === this.generation) this.status.textContent = 'سرور در دسترس نیست. «این دستگاه» را انتخاب کن یا دوباره تلاش کن.';
        }
    }
    async beforeClose() { this.generation += 1; }
    dispose() {
        this.generation += 1; this.period.removeEventListener('change', this.onPeriod);
        this.form.removeEventListener('submit', this.onSubmit); super.dispose();
    }
}
