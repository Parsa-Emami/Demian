const NUMBER_FORMATTER = new Intl.NumberFormat('fa-IR');

function phaseLabel(state) {
    return ({
        preparing: 'PREPARING', countdown: 'COUNTDOWN', active: 'ACTIVE',
        success: 'SUCCESS', failed: 'FAILED', reward: 'REWARD', results: 'RESULTS',
    })[state] ?? 'READY';
}

function formatTime(value) {
    const seconds = Math.max(0, Math.ceil(Number(value) || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function objectiveMarkup(objectives) {
    return objectives.map((objective) => `
        <li data-event-objective="${objective.id}" data-status="${objective.status}">
            <span>${objective.title}</span>
            <b>${Math.round(objective.progress * 100)}%</b>
            <i style="--event-progress:${Math.round(objective.progress * 100)}%"></i>
        </li>
    `).join('');
}

export default class EventHud {
    constructor({ root, animation, onPause } = {}) {
        this.root = root;
        this.animation = animation;
        this.onPause = onPause;
        this.element = null;
        this.refs = null;
        this.bannerTimer = null;
        this.lastState = null;
        this.onClick = this.onClick.bind(this);
    }

    mount() {
        const host = this.root?.querySelector('[data-game-hud-host]');
        if (!host || this.element) return;
        const element = document.createElement('section');
        element.className = 'event-hud';
        element.dir = 'rtl';
        element.innerHTML = `
            <header class="event-hud__top">
                <div class="event-hud__brand"><span>✦</span><div><small>DEMIAN LIVE EVENT</small><strong data-event-title>EVENT</strong></div></div>
                <div class="event-hud__stats" dir="ltr">
                    <span><small>PHASE</small><b data-event-phase>READY</b></span>
                    <span><small>TIME</small><b data-event-time>00:00</b></span>
                    <span><small>SCORE</small><b data-event-score>0</b></span>
                    <span><small>COMBO</small><b data-event-combo>0</b></span>
                    <span><small>HP</small><b data-event-health>100</b></span>
                </div>
                <button type="button" class="event-hud__pause" data-event-pause aria-label="توقف بازی">Ⅱ</button>
            </header>
            <aside class="event-hud__panel">
                <small>OBJECTIVES</small>
                <ul data-event-objectives></ul>
                <p data-event-status>در حال آماده‌سازی رویداد…</p>
            </aside>
            <div class="event-hud__banner" data-event-banner></div>
            <footer class="event-hud__footer" dir="ltr">
                <span><b>WASD</b> MOVE</span><span><b>SHIFT</b> RUN</span><span><b>SPACE / E</b> ACTION</span><span><b>ESC</b> PAUSE</span>
            </footer>
            <div data-control-surface="event" class="event-touch-actions" dir="ltr">
                <button type="button" data-input-press="eventAction" class="is-primary">ACTION</button>
                <button type="button" data-input-hold="run">RUN</button>
            </div>
        `;
        host.appendChild(element);
        element.addEventListener('click', this.onClick);
        this.element = element;
        this.refs = {
            title: element.querySelector('[data-event-title]'), phase: element.querySelector('[data-event-phase]'),
            time: element.querySelector('[data-event-time]'), score: element.querySelector('[data-event-score]'),
            combo: element.querySelector('[data-event-combo]'), health: element.querySelector('[data-event-health]'),
            objectives: element.querySelector('[data-event-objectives]'), status: element.querySelector('[data-event-status]'),
            banner: element.querySelector('[data-event-banner]'),
        };
        this.animation?.reveal(element, { duration: 320 });
    }

    onClick(event) {
        if (event.target.closest('[data-event-pause]')) this.onPause?.();
    }

    update({ definition, director, score, player, status = '' } = {}) {
        if (!this.element || !director) return;
        this.refs.title.textContent = definition?.title ?? 'EVENT';
        this.refs.phase.textContent = phaseLabel(director.state);
        this.refs.time.textContent = director.state === 'countdown' ? String(Math.ceil(director.countdown)) : formatTime(director.remaining);
        this.refs.score.textContent = NUMBER_FORMATTER.format(score?.score ?? 0);
        this.refs.combo.textContent = String(score?.combo ?? 0);
        this.refs.health.textContent = String(Math.max(0, Math.ceil(player?.health ?? 0)));
        this.refs.status.textContent = status || definition?.description || '—';
        this.refs.objectives.innerHTML = objectiveMarkup(director.objectives ?? []);
        this.element.dataset.phase = director.state;
        if (this.lastState !== director.state) {
            if (director.state === 'active') this.announce('EVENT START', 'accent', 1300);
            if (director.state === 'success') this.announce('EVENT COMPLETE', 'success', 1800);
            if (director.state === 'failed') this.announce('EVENT FAILED', 'danger', 1800);
            this.lastState = director.state;
        }
    }

    announce(message, tone = 'info', duration = 1500) {
        if (!this.refs?.banner) return;
        window.clearTimeout(this.bannerTimer);
        this.refs.banner.textContent = message;
        this.refs.banner.dataset.tone = tone;
        this.refs.banner.classList.add('is-visible');
        this.bannerTimer = window.setTimeout(() => this.refs?.banner?.classList.remove('is-visible'), duration);
    }

    setPaused(paused) { this.element?.classList.toggle('is-paused', Boolean(paused)); }

    dispose() {
        window.clearTimeout(this.bannerTimer);
        this.element?.removeEventListener('click', this.onClick);
        this.element?.remove();
        this.element = null;
        this.refs = null;
    }
}
