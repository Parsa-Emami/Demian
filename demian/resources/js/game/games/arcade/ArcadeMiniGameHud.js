import { ARCADE_CHARACTER_ROSTER, arcadeCharacterLabel } from './ArcadeCharacterRoster.js';

function escape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function timeLabel(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default class ArcadeMiniGameHud {
    constructor({ root, config, activeSlug, onCharacterSelect }) {
        this.root = root;
        this.config = config;
        this.activeSlug = activeSlug;
        this.onCharacterSelect = onCharacterSelect;
        this.element = null;
        this.rosterOpen = false;
        this.selecting = false;
        this.onClick = this.onClick.bind(this);
    }

    mount() {
        const host = this.root.querySelector('[data-game-hud-host]');
        if (!host) return;
        this.element = document.createElement('section');
        this.element.className = 'arcade-mini-hud';
        this.element.dir = 'ltr';
        this.element.innerHTML = `
            <div class="arcade-mini-hud__top">
                <div class="arcade-mini-hud__brand">
                    <small>${escape(this.config.kicker ?? 'DEMIAN MINI ARCADE')}</small>
                    <strong>${escape(this.config.title)}</strong>
                    <span>${escape(this.config.subtitle)}</span>
                </div>
                <div class="arcade-mini-hud__stats" aria-live="polite">
                    <span><small>SCORE</small><b data-arcade-score>000000</b></span>
                    <span><small>TIME</small><b data-arcade-time>01:00</b></span>
                    <span><small>COMBO</small><b data-arcade-combo>×1</b></span>
                    <span><small>HP</small><b data-arcade-lives>♥♥♥</b></span>
                </div>
                <button type="button" data-arcade-roster-toggle class="arcade-mini-hud__roster-button">
                    <span>PLAYER</span><b data-arcade-player>${escape(arcadeCharacterLabel(this.activeSlug))}</b>
                </button>
            </div>
            <div class="arcade-mini-hud__status">
                <span data-arcade-status>${escape(this.config.objective ?? '')}</span>
                <small>${escape(this.config.controls ?? 'WASD / JUMP / DASH / USE')}</small>
            </div>
            <div data-arcade-roster class="arcade-character-deck" hidden aria-hidden="true">
                <header><div><small>PLAYER SELECT</small><strong>DEMIAN ROSTER</strong></div><button type="button" data-arcade-roster-close aria-label="Close">×</button></header>
                <div class="arcade-character-deck__rail">
                    ${ARCADE_CHARACTER_ROSTER.map((character) => `
                        <button type="button" class="arcade-character-card ${character.slug === this.activeSlug ? 'is-active' : ''}" data-arcade-character="${escape(character.slug)}">
                            ${character.referenceCard
                                ? `<img src="${escape(character.referenceCard)}" alt="${escape(character.label)} character sheet" loading="lazy">`
                                : `<span class="arcade-character-card__fallback">${escape(character.label.split(' / ')[0])}</span>`}
                            <span>${escape(character.label)}</span>
                        </button>
                    `).join('')}
                </div>
                <footer>کاراکتر انتخابی با Sprite/Atlas اصلی خودش در هر شش مینی‌گیم اجرا می‌شود.</footer>
            </div>
        `;
        host.appendChild(this.element);
        this.element.addEventListener('click', this.onClick);
    }

    async onClick(event) {
        if (event.target.closest('[data-arcade-roster-toggle]')) {
            this.setRosterOpen(!this.rosterOpen);
            return;
        }
        if (event.target.closest('[data-arcade-roster-close]')) {
            this.setRosterOpen(false);
            return;
        }
        const button = event.target.closest('[data-arcade-character]');
        if (!button || this.selecting) return;
        const slug = button.dataset.arcadeCharacter;
        if (!slug || slug === this.activeSlug) {
            this.setRosterOpen(false);
            return;
        }
        this.selecting = true;
        this.element.dataset.selectingCharacter = 'true';
        try {
            await this.onCharacterSelect?.(slug);
            this.setActiveSlug(slug);
            this.setRosterOpen(false);
        } finally {
            this.selecting = false;
            delete this.element.dataset.selectingCharacter;
        }
    }

    setRosterOpen(open) {
        this.rosterOpen = Boolean(open);
        const panel = this.element?.querySelector('[data-arcade-roster]');
        if (!panel) return;
        panel.hidden = !this.rosterOpen;
        panel.setAttribute('aria-hidden', String(!this.rosterOpen));
        this.element.classList.toggle('is-roster-open', this.rosterOpen);
    }

    setActiveSlug(slug) {
        this.activeSlug = slug;
        const label = this.element?.querySelector('[data-arcade-player]');
        if (label) label.textContent = arcadeCharacterLabel(slug);
        this.element?.querySelectorAll('[data-arcade-character]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.arcadeCharacter === slug);
        });
    }

    update(snapshot = {}) {
        if (!this.element) return;
        const set = (selector, value) => {
            const node = this.element.querySelector(selector);
            if (node) node.textContent = value;
        };
        set('[data-arcade-score]', String(Math.max(0, Math.floor(snapshot.score ?? 0))).padStart(6, '0'));
        set('[data-arcade-time]', timeLabel(snapshot.timeLeft));
        set('[data-arcade-combo]', `×${Math.max(1, Math.floor(snapshot.combo ?? 1))}`);
        set('[data-arcade-lives]', `${'♥'.repeat(Math.max(0, snapshot.lives ?? 0))}${'·'.repeat(Math.max(0, 3 - (snapshot.lives ?? 0)))}`);
        set('[data-arcade-status]', snapshot.status ?? this.config.objective ?? '');
    }

    setPaused(paused) {
        this.element?.classList.toggle('is-paused', Boolean(paused));
    }

    dispose() {
        this.element?.removeEventListener('click', this.onClick);
        this.element?.remove();
        this.element = null;
    }
}
