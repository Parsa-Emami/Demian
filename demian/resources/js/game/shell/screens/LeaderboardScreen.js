import BaseScreen from './BaseScreen.js';
import { remainingWeeklySeconds, formatWeeklyCountdown } from '../../leaderboard/WeeklyCountdown.js';

export default class LeaderboardScreen extends BaseScreen {
    constructor({ service, ...options }) {
        super({ ...options, layer: 'modal' });
        this.service = service;
        this.generation = 0;
        this.period = this.element.querySelector('[data-ranking-period]');
        this.game = this.element.querySelector('[data-ranking-game]');
        this.week = this.element.querySelector('[data-ranking-week]');
        this.weekWrap = this.element.querySelector('[data-ranking-week-wrap]');
        this.scoreHeading = this.element.querySelector('[data-ranking-score-heading]');
        this.gameHeading = this.element.querySelector('[data-ranking-game-heading]');
        this.weeksLoaded = false;
        this.body = this.element.querySelector('[data-ranking-rows]');
        this.status = this.element.querySelector('[data-ranking-status]');
        this.countdown = this.element.querySelector('[data-ranking-countdown]');
        this.personalBest = this.element.querySelector('[data-ranking-personal-best]');
        this.form = this.element.querySelector('[data-ranking-name-form]');
        this.recovery = this.element.querySelector('[data-ranking-recovery]');
        this.recoveryForm = this.element.querySelector('[data-ranking-recover-form]');
        this.issueRecovery = this.element.querySelector('[data-ranking-issue-recovery]');
        this.recoveryLink = this.element.querySelector('[data-ranking-recovery-link]');
        this.recoveryStatus = this.element.querySelector('[data-ranking-recovery-status]');
        this.deleteAccount = this.element.querySelector('[data-ranking-delete-account]');
        this.exportAccount = this.element.querySelector('[data-ranking-export-account]');
        this.issueBackup = this.element.querySelector('[data-ranking-issue-backup]');
        this.backupCode = this.element.querySelector('[data-ranking-backup-code]');
        this.timer = null;
        this.snapshot = null;
        this.receivedAtMs = 0;
        this.nextRefreshAt = 0;
        this.loading = false;
        this.lastForcedRolloverKey = null;
        this.onPeriod = () => this.load();
        this.onGame = () => void this.switchGame();
        this.onWeek = () => this.load();
        this.onSubmit = async event => {
            event.preventDefault();
            const button = this.form.querySelector('button');
            button.disabled = true;
            try {
                await this.service.rename(this.form.elements.display_name.value);
                this.status.textContent = 'نام نمایشی ذخیره شد.';
            } catch (error) {
                this.status.textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
        this.onIssueRecovery = async () => {
            this.issueRecovery.disabled = true;
            this.recoveryLink.value = '';
            try {
                const link = await this.service.issueRecoveryLink();
                this.recoveryLink.value = link;
                this.recoveryLink.focus();
                this.recoveryLink.select();
                const expires = Date.parse(this.service.recoveryExpiresAt ?? '');
                this.recoveryStatus.textContent = 'لینک یک‌بارمصرف است و ' +
                    (Number.isFinite(expires)
                        ? 'تا ' + new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium',
                            timeStyle: 'short' }).format(expires) + ' اعتبار دارد. '
                        : 'تاریخ انقضای آن را سرور تعیین می‌کند. ') +
                    'آن را امن نگهداری کن؛ ساخت لینک تازه، قبلی را باطل می‌کند.';
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                this.issueRecovery.disabled = false;
            }
        };
        this.onRecover = async event => {
            event.preventDefault();
            const button = this.recoveryForm.querySelector('button[type="submit"]');
            button.disabled = true;
            try {
                const code = this.recoveryForm.elements.recovery_code.value;
                const recovered = await this.service.recoverAccount(code);
                this.recoveryForm.reset();
                this.form.elements.display_name.value = recovered.display_name;
                await this.load();
                this.backupCode.value = '';
                this.recoveryStatus.textContent = 'حساب بازیابی شد؛ نشست قبلی، لینک کوتاه‌مدت و کد پشتیبان مصرف شدند. برای بازیابی بعدی کد تازه بساز.';
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
        this.onDeleteAccount = async () => {
            if (!globalThis.confirm?.('حساب، تمام رکوردهای جهانی و داده‌های این دستگاه برای همیشه حذف می‌شوند. ادامه می‌دهی؟')) return;
            this.deleteAccount.disabled = true;
            try {
                await this.service.eraseAccount();
                this.recoveryLink.value = '';
                this.backupCode.value = '';
                this.recoveryForm.reset();
                this.recoveryStatus.textContent = 'حساب و داده‌های آن پس از تأیید سرور حذف شدند.';
                this.form.elements.display_name.value = this.service.displayName;
                await this.load();
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                this.deleteAccount.disabled = false;
            }
        };
        this.onIssueBackup = async () => {
            this.issueBackup.disabled = true;
            this.backupCode.value = '';
            try {
                this.backupCode.value = await this.service.issueBackupCode();
                this.backupCode.focus();
                this.backupCode.select();
                const expires = Date.parse(this.service.backupExpiresAt ?? '');
                this.recoveryStatus.textContent = 'کد پشتیبان یک‌بارمصرف را خارج از دستگاه امن نگهدار. انقضا: ' +
                    (Number.isFinite(expires)
                        ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium',
                            timeStyle: 'short' }).format(expires) : 'طبق زمان سرور') +
                    '. ساخت کد تازه، کد قبلی را باطل می‌کند.';
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                this.issueBackup.disabled = false;
            }
        };
        this.onExportAccount = async () => {
            if (!this.exportAccount) return;
            this.exportAccount.disabled = true;
            try {
                // Only a private, explicit user gesture creates this local file.
                // Never send account JSON to analytics or browser storage.
                const snapshot = await this.service.accountData();
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                try {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'demian-account-summary.json';
                    document.body.append(link);
                    link.click();
                    link.remove();
                    this.recoveryStatus.textContent = 'خلاصه اطلاعات حساب دانلود شد؛ فایل شامل کلید ورود یا کد تخفیف نیست.';
                } finally {
                    setTimeout(() => URL.revokeObjectURL(url), 2500);
                }
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                this.exportAccount.disabled = false;
            }
        };
        this.exportAccount?.addEventListener('click', this.onExportAccount);
        this.issueBackup?.addEventListener('click', this.onIssueBackup);
        this.deleteAccount?.addEventListener('click', this.onDeleteAccount);
        this.issueRecovery.addEventListener('click', this.onIssueRecovery);
        this.recoveryForm.addEventListener('submit', this.onRecover);
        this.period.addEventListener('change', this.onPeriod);
        this.game?.addEventListener('change', this.onGame);
        this.week?.addEventListener('change', this.onWeek);
        this.form.addEventListener('submit', this.onSubmit);
    }

    async beforeOpen() {
        this.form.elements.display_name.value = this.service.displayName;
        this.issueRecovery.disabled = !this.service.connected;
        this.issueBackup.disabled = !this.service.connected;
        this.backupCode.value = '';
        this.deleteAccount.disabled = !this.service.connected;
        if (this.exportAccount) this.exportAccount.disabled = !this.service.connected || !this.service.identity?.token;
        for (const control of this.recoveryForm.elements) control.disabled = !this.service.connected;
        this.recoveryForm.elements.recovery_code.value = this.service.recoveryOffer ?? '';
        this.recoveryLink.value = '';
        this.recoveryStatus.textContent = this.service.recoveryOffer
            ? 'کد بازیابی لینک شناسایی شد؛ برای تعویض حساب روی «بازیابی حساب» بزنید.'
            : this.service.needsAccountRestore
                ? 'حساب قبلی در این نشست باز نیست. برای حفظ رکوردهای آن باید با کد بازیابی وارد شوی.'
                : 'توکن ورود فقط در نشست مرورگر نگهداری می‌شود. قبل از بستن مرورگر، لینک بازیابی را دریافت و امن ذخیره کن.';
        for (const option of this.period.options) {
            option.disabled = !this.service.connected && option.value !== 'device';
        }
        this.period.value = this.service.connected ? 'weekly' : 'device';
        if (this.game) {
            const options = [...this.game.options];
            options.forEach(option => { option.disabled = option.value !== 'dino-run'; });
            this.game.value = this.service.connected ? 'all-games' : 'dino-run';
            if (this.service.connected) options.find(option => option.value === 'all-games').disabled = false;
            if (this.service.connected) {
                try {
                    const catalog = await this.service.games();
                    for (const option of options) {
                        option.disabled = option.value !== 'all-games'
                            && !catalog.games?.some(game =>
                                game.game_id === option.value && game.ranked === true);
                    }
                } catch { /* preserve safe default */ }
            }
        }
        this.snapshot = null;
        this.lastForcedRolloverKey = null;
        this.nextRefreshAt = this.monotonicNow() + 60000;
        this.weeksLoaded = false;
        this.week.value = '';
        this.configureMode();
        if (this.service.pending) await this.service.retry();
        if (this.service.connected) await this.loadWeeks();
        await this.load();
        if (this.timer == null) this.timer = setInterval(() => this.tick(), 1000);
    }

    configureMode() {
        const shared = this.service.connected && this.game?.value === 'all-games';
        this.weekWrap.hidden = !shared;
        this.week.disabled = !shared;
        this.period.disabled = shared;
        if (shared) this.period.value = 'weekly';
        this.gameHeading.hidden = !shared;
        this.scoreHeading.textContent = shared ? 'امتیاز رقابتی' : 'امتیاز';
        this.lastForcedRolloverKey = null;
    }

    async loadWeeks() {
        if (this.weeksLoaded || !this.service.connected || !this.week) return;
        // The archived week list comes from the server; no arbitrary client
        // timestamps can select future periods or forge a game season.
        const first = document.createElement('option');
        first.value = '';
        first.textContent = 'این هفته (زنده)';
        this.week.replaceChildren(first);
        try {
            const weeks = await this.service.weeklyWeeks();
            for (const week of weeks) {
                if (week.status === 'current' || !/^\d{4}-\d{2}-\d{2}$/.test(week.week)) continue;
                const option = document.createElement('option');
                option.value = week.week;
                option.textContent = 'هفته ' + week.week
                    + (week.status === 'finalized' ? ' · نهایی' : ' · در انتظار تسویه');
                this.week.append(option);
            }
            this.weeksLoaded = true;
        } catch {
            // Keep live leaderboard available when archive listing fails.
            this.weeksLoaded = false;
        }
    }

    async switchGame() {
        this.week.value = '';
        this.configureMode();
        if (this.game.value === 'all-games') await this.loadWeeks();
        await this.load();
    }

    monotonicNow() { return globalThis.performance?.now?.() ?? Date.now(); }

    tick() {
        const remaining = this.renderCountdown();
        if (this.element.hidden || globalThis.document?.visibilityState === 'hidden') return;
        const now = this.monotonicNow();
        // Poll every minute; at the weekly rollover refresh as soon as the
        // clock reaches zero instead of displaying the expired week's ranks.
        const expiredKey = this.snapshot?.period_key;
        if (remaining === 0 && this.period.value === 'weekly'
            && (this.game.value !== 'all-games' || this.week.value === '') && expiredKey
            && this.lastForcedRolloverKey !== expiredKey) {
            // At most one extra request per expired season, even if a stale API
            // response keeps reporting the previous boundary for a few seconds.
            this.lastForcedRolloverKey = expiredKey;
            this.nextRefreshAt = now;
        }
        if (!this.loading && now >= this.nextRefreshAt) void this.load();
    }

    renderCountdown() {
        const isWeekly = this.period.value === 'weekly' && this.service.connected
            && (this.game.value !== 'all-games' || this.week.value === '');
        this.countdown.hidden = !isWeekly;
        if (!isWeekly) return null;
        const remaining = remainingWeeklySeconds(this.snapshot, this.receivedAtMs, this.monotonicNow());
        this.countdown.textContent = remaining == null
            ? 'زمان پایان هفته در انتظار سرور'
            : `تا پایان رقابت این هفته: ${formatWeeklyCountdown(remaining)}`;
        return remaining;
    }

    async load() {
        const generation = ++this.generation;
        this.loading = true;
        this.nextRefreshAt = this.monotonicNow() + 60000;
        this.status.textContent = 'در حال دریافت امتیازهای تأییدشده…';
        this.personalBest.textContent = '';
        this.body.replaceChildren();
        this.snapshot = null;
        this.renderCountdown();
        try {
            const activeGame = this.game?.value ?? 'dino-run';
            const shared = activeGame === 'all-games' && this.service.connected;
            const chosenWeek = shared ? this.week.value : '';
            const ownScore = shared
                ? this.service.myWeeklyRanking(chosenWeek)
                : this.period.value !== 'device' && activeGame === 'dino-run'
                    ? this.service.personalBest(this.period.value) : Promise.resolve(null);
            const result = shared
                ? await this.service.weeklyRanking(chosenWeek)
                : await this.service.list(this.period.value, activeGame);
            if (generation !== this.generation) return;
            this.snapshot = result.mode === 'online' && (!shared || result.is_current) ? result : null;
            this.receivedAtMs = this.monotonicNow();
            if (shared) {
                this.status.textContent = result.status === 'finalized'
                    ? 'جدول نهایی و آرشیوشده · امتیازهای تأییدشده و نسخه ثابت قوانین'
                    : result.status === 'live_preview'
                        ? 'رتبه‌بندی زنده بر پایه بازپخش تأییدشده · موقت؛ مبنای جایزه نیست'
                        : 'نتایج این دوره هنوز تسویه یا نهایی نشده‌اند.';
                if (result.status !== 'archive_pending' && !result.data?.length) {
                    this.status.textContent += ' هنوز امتیازی ثبت نشده است.';
                }
            } else {
                this.status.textContent = result.mode === 'device'
                    ? 'رکوردهای همین مرورگر؛ ثبت جهانی نشده‌اند.'
                    : 'رکوردهای تأییدشده سرور · شروع هفته شنبه ساعت ۰۰:۰۰ تهران';
                if (!result.data?.length) this.status.textContent += ' هنوز رکوردی ثبت نشده است.';
            }
            for (const row of result.data ?? []) {
                const tr = document.createElement('tr');
                if (this.service.identity?.player_id === row.player_id) tr.dataset.myRow = 'true';
                const cells = [row.rank, row.display_name,
                    shared ? row.competition_points : row.score];
                for (const value of cells) {
                    const td = document.createElement('td');
                    td.textContent = typeof value === 'number' && Number.isFinite(value)
                        ? new Intl.NumberFormat('fa-IR').format(value)
                        : String(value ?? '—');
                    tr.append(td);
                }
                if (shared) {
                    const td = document.createElement('td');
                    td.textContent = String(row.source_game_id ?? '—');
                    const note = document.createElement('small');
                    note.className = 'ranking-panel__mode';
                    note.dataset.qualified = String(row.qualified === true);
                    note.textContent = row.qualified
                        ? 'واجد حداقل مشارکت · تأییدشده'
                        : 'موقت · شرکت‌کننده کمتر از ۲۰';
                    td.append(note);
                    tr.append(td);
                }
                this.body.append(tr);
            }
            this.renderCountdown();
            const own = await ownScore;
            if (generation !== this.generation) return;
            if (shared) {
                if (!this.service.identity?.token) {
                    this.personalBest.textContent = 'برای نمایش رتبه دقیق خود، حساب آنلاین را بازیابی کنید.';
                } else if (own?.my_best) {
                    const format = new Intl.NumberFormat('fa-IR');
                    this.personalBest.textContent = 'رتبهٔ شما: ' + format.format(own.my_rank)
                        + ' از ' + format.format(own.participants ?? 0)
                        + ' · ' + format.format(own.my_best.competition_points) + ' از ۱۰۰۰'
                        + ' · ' + own.my_best.source_game_id
                        + (own.my_best.qualified ? ' · دارای حداقل مشارکت' : ' · موقت')
                        + (result.status === 'live_preview' ? ' · هنوز نهایی نشده' : '');
                } else {
                    this.personalBest.textContent = 'هنوز رکورد رقابتی ثبت نکرده‌ای؛ رتبه شخصی پس از تأیید سرور نمایش داده می‌شود.';
                }
            } else {
                this.personalBest.textContent = result.mode === 'online' && activeGame !== 'dino-run'
                    ? 'این جدول فقط نتایج بازپخش‌شده و تأییدشده توسط سرور را نمایش می‌دهد.'
                    : result.mode === 'online'
                        ? own?.best
                            ? 'رتبهٔ شما: ' + new Intl.NumberFormat('fa-IR').format(own.my_rank)
                                + ' از ' + new Intl.NumberFormat('fa-IR').format(own.participants ?? 0)
                                + ' · رکورد: ' + new Intl.NumberFormat('fa-IR').format(own.best.score)
                            : 'هنوز رکورد تأییدشده‌ای برای این دوره نداری.'
                        : '';
            }
        } catch {
            if (generation === this.generation) {
                this.status.textContent = 'سرور در دسترس نیست. اتصال را بررسی کنید یا برای رکورد دستگاه، Dino Run را انتخاب کنید.';
                this.renderCountdown();
            }
        } finally {
            if (generation === this.generation) this.loading = false;
        }
    }

    async beforeClose() {
        this.generation++;
        this.loading = false;
        this.snapshot = null;
        this.recoveryLink.value = '';
        this.backupCode.value = '';
        if (this.timer != null) clearInterval(this.timer);
        this.timer = null;
    }

    dispose() {
        this.generation++;
        if (this.timer != null) clearInterval(this.timer);
        this.timer = null;
        this.issueBackup?.removeEventListener('click', this.onIssueBackup);
        this.deleteAccount?.removeEventListener('click', this.onDeleteAccount);
        this.issueRecovery.removeEventListener('click', this.onIssueRecovery);
        this.recoveryForm.removeEventListener('submit', this.onRecover);
        this.period.removeEventListener('change', this.onPeriod);
        this.game?.removeEventListener('change', this.onGame);
        this.form.removeEventListener('submit', this.onSubmit);
        this.week?.removeEventListener('change', this.onWeek);
        super.dispose();
    }
}
