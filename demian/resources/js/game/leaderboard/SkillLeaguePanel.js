import { formatLeagueName } from './SkillLeaguePresentation.js';

const TIERS = ['bronze','silver','gold','legend','placement'];
const fmt = new Intl.NumberFormat('fa-IR');

export default class SkillLeaguePanel {
    constructor(service, anchor) {
        this.service = service;
        this.serial = 0;
        this.root = document.createElement('details');
        this.root.className = 'ranking-panel__mode';
        this.root.dataset.skillLeague = 'true';
        const summary = document.createElement('summary');
        summary.textContent = 'لیگ مهارت دمیان';
        const label = document.createElement('label');
        label.textContent = 'لیگ: ';
        this.select = document.createElement('select');
        this.select.setAttribute('aria-label','لیگ مهارت');
        for (const league of TIERS) {
            const option = document.createElement('option');
            option.value = league; option.textContent = formatLeagueName(league);
            this.select.append(option);
        }
        label.append(this.select);
        this.status = document.createElement('p');
        this.status.setAttribute('role','status');
        this.profile = document.createElement('p');
        this.profile.setAttribute('aria-live','polite');
        this.rows = document.createElement('ol');
        this.rows.style.paddingInlineStart = '1.5em';
        const note = document.createElement('p');
        note.textContent = 'نتایج لیگ پس از تسویه هفتگی قطعی می‌شوند. حداقل ۲۰ شماره تأییدشده در هر بازی؛ افت سطح با سه هفته واجد شرایط. نشان لیگ جنبه افتخاری دارد و جایزه نقدی یا کوپن اضافه ایجاد نمی‌کند.';
        this.root.append(summary,label,this.status,this.profile,this.rows,note);
        anchor.after(this.root);
        this.onToggle = () => { if (this.root.open) void this.load(); else this.serial++; };
        this.onChange = () => { if (this.root.open) void this.load(); };
        this.root.addEventListener('toggle',this.onToggle);
        this.select.addEventListener('change',this.onChange);
    }

    open() {
        this.reset();
        this.root.hidden = !this.service.connected;
    }

    reset() {
        this.serial++;
        this.root.open = false;
        this.status.textContent = '';
        this.profile.textContent = '';
        this.rows.replaceChildren();
    }

    async load() {
        const ticket = ++this.serial, league = this.select.value;
        if (!this.service.connected) return;
        this.status.textContent = 'در حال دریافت آخرین لیگ نهایی…';
        this.profile.textContent = ''; this.rows.replaceChildren();
        try {
            const [board, own] = await Promise.all([
                this.service.skillLeague(league), this.service.mySkillLeague().catch(()=>null),
            ]);
            if (ticket !== this.serial || !this.root.open) return;
            this.status.textContent = board.status === 'finalized'
                ? 'هفته ' + String(board.period_key).split(':').at(-1) + ' · ' + fmt.format(board.participants ?? 0) + ' شرکت‌کننده'
                : 'نخستین فصل لیگ هنوز نهایی نشده است.';
            if (own) {
                this.profile.textContent = own.verified
                    ? 'سطح شروع هفته: ' + formatLeagueName(own.current_league)
                        + (own.last_result?.qualified ? ' · آخرین نتیجه: '+formatLeagueName(own.last_result.league)+' · '+fmt.format(own.last_result.points)+' از ۱۰۰۰' : ' · در انتظار حداقل مشارکت')
                    : 'برای ورود به لیگ، نخست شماره موبایل را تأیید کن.';
            } else this.profile.textContent = 'برای نمایش لیگ شخصی وارد حساب آنلاین شو.';
            for (const row of board.data ?? []) {
                const item = document.createElement('li');
                item.style.listStyle = 'none';
                item.textContent = fmt.format(row.rank) + ' · ' + String(row.display_name ?? '—') + ' · '
                    + (row.qualified ? fmt.format(row.points) + ' از ۱۰۰۰' : 'در انتظار تعیین سطح')
                    + (row.recognition ? ' · نشان افتخار' : '');
                this.rows.append(item);
            }
            if (!board.data?.length) this.status.textContent += ' · هنوز رکوردی در این لیگ نیست.';
        } catch {
            if (ticket === this.serial && this.root.open) this.status.textContent = 'دریافت لیگ ناموفق بود؛ دوباره تلاش کن.';
        }
    }

    dispose() {
        this.reset();
        this.root.removeEventListener('toggle',this.onToggle);
        this.select.removeEventListener('change',this.onChange);
        this.root.remove();
    }
}
