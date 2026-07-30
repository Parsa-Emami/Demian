const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

function formatTime(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function phaseLabel(state) {
    return ({
        'role-reveal': 'ROLE REVEAL',
        'hiding-countdown': 'HIDE NOW',
        seeking: 'SEEKING',
        'round-end': 'ROUND END',
        results: 'RESULTS',
    })[state] ?? 'READY';
}

export default class HideAndSeekHud {
    constructor({ root, animation } = {}) {
        this.root = root;
        this.animation = animation;
        this.element = null;
        this.bannerTimer = null;
        this.last = Object.create(null);
    }

    mount() {
        const host = this.root.querySelector('[data-game-hud-host]');
        if (!host || this.element) return;
        const element = document.createElement('section');
        element.className = 'hide-seek-hud';
        element.dataset.gameHud = 'hide-and-seek';
        element.dataset.gameplayUi = '';
        element.setAttribute('aria-label', 'رابط بازی قایم‌باشک');
        element.innerHTML = `
            <header class="hide-seek-hud__top" dir="ltr">
                <div class="hide-seek-hud__brand"><span>◉</span><div><small>CAFÉ DEMIAN</small><strong>HIDE & SEEK</strong></div></div>
                <div class="hide-seek-hud__stats">
                    <span><small>ROLE</small><b data-hs-role>—</b></span>
                    <span><small>PHASE</small><b data-hs-phase>READY</b></span>
                    <span><small>TIME</small><b data-hs-time>00:00</b></span>
                    <span><small>LEFT</small><b data-hs-left>0</b></span>
                    <span><small>SCORE</small><b data-hs-score>0</b></span>
                </div>
                <div class="hide-seek-hud__actions">
                    <button type="button" data-shell-action="pause" aria-label="توقف بازی">Ⅱ</button>
                    <button type="button" data-shell-action="exit-game" aria-label="خروج">×</button>
                </div>
            </header>

            <aside class="hide-seek-hud__objective" dir="rtl">
                <small>ماموریت</small>
                <strong data-hs-objective>برای شروع آماده شو.</strong>
                <p data-hs-status>—</p>
                <div class="hide-seek-hud__meter"><i data-hs-danger></i></div>
                <span data-hs-danger-label>امن</span>
            </aside>

            <div data-hs-banner class="hide-seek-hud__banner" role="status" aria-live="polite"></div>

            <footer class="hide-seek-hud__footer" dir="ltr">
                <span><b>WASD</b> MOVE</span>
                <span><b>SHIFT</b> RUN</span>
                <span><b>ENTER / E</b> INTERACT / TAG</span>
                <span><b>R</b> REVEAL PULSE</span>
                <span><b>ESC</b> PAUSE</span>
            </footer>

            <div data-control-surface="hide-and-seek" class="hide-seek-touch-actions" dir="ltr">
                <button type="button" data-input-press="interact" class="is-primary">USE</button>
                <button type="button" data-input-hold="run">RUN</button>
                <button type="button" data-input-press="revealPulse">PULSE</button>
            </div>
        `;
        host.appendChild(element);
        this.element = element;
        this.refs = {
            role: element.querySelector('[data-hs-role]'),
            phase: element.querySelector('[data-hs-phase]'),
            time: element.querySelector('[data-hs-time]'),
            left: element.querySelector('[data-hs-left]'),
            score: element.querySelector('[data-hs-score]'),
            objective: element.querySelector('[data-hs-objective]'),
            status: element.querySelector('[data-hs-status]'),
            danger: element.querySelector('[data-hs-danger]'),
            dangerLabel: element.querySelector('[data-hs-danger-label]'),
            banner: element.querySelector('[data-hs-banner]'),
        };
        this.animation?.reveal(element, { duration: 320 });
    }

    update(snapshot = {}) {
        if (!this.element) return;
        const role = snapshot.playerRole === 'seeker' ? 'SEEKER' : 'HIDER';
        const values = {
            role,
            phase: phaseLabel(snapshot.match?.state),
            time: formatTime(snapshot.match?.timer?.remaining),
            left: String(snapshot.match?.remainingHiders ?? 0),
            score: NUMBER_FORMATTER.format(Math.max(0, snapshot.score ?? 0)),
        };
        Object.entries(values).forEach(([key, value]) => {
            if (this.last[key] === value) return;
            this.refs[key].textContent = value;
            this.last[key] = value;
        });

        const objective = snapshot.playerRole === 'seeker'
            ? 'همه‌ی مخفی‌شده‌ها را پیش از پایان زمان پیدا کن.'
            : snapshot.hidden
                ? 'بی‌حرکت بمان؛ حرکت، دیده‌شدن را آسان می‌کند.'
                : 'یک مخفیگاه پیدا کن و با Enter وارد شو.';
        this.refs.objective.textContent = objective;
        this.refs.status.textContent = snapshot.status ?? '—';
        const danger = Math.max(0, Math.min(1, Number(snapshot.danger) || 0));
        this.refs.danger.style.width = `${Math.round(danger * 100)}%`;
        this.refs.dangerLabel.textContent = danger > 0.72 ? 'در معرض دید' : danger > 0.35 ? 'مشکوک' : 'امن';
        this.element.dataset.role = snapshot.playerRole ?? 'hider';
        this.element.classList.toggle('is-paused', Boolean(snapshot.paused));
    }

    announce(message, tone = 'info', duration = 1500) {
        if (!this.refs?.banner || !message) return;
        window.clearTimeout(this.bannerTimer);
        this.refs.banner.textContent = message;
        this.refs.banner.dataset.tone = tone;
        this.refs.banner.classList.add('is-visible');
        this.animation?.reveal(this.refs.banner, { duration: 180 });
        this.bannerTimer = window.setTimeout(() => this.refs?.banner?.classList.remove('is-visible'), duration);
    }

    setPaused(paused) {
        this.element?.classList.toggle('is-paused', paused);
    }

    dispose() {
        window.clearTimeout(this.bannerTimer);
        this.element?.remove();
        this.element = null;
        this.refs = null;
    }
}
