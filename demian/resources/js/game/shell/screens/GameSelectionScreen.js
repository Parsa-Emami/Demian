import BaseScreen from './BaseScreen';
import ScrollSnapRail from '../../../ui/ScrollSnapRail.js';

function escape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export default class GameSelectionScreen extends BaseScreen {
    constructor({ catalog, ...options }) {
        super(options);
        this.catalog = catalog;
        this.grid = this.element.querySelector('[data-game-grid]');
        this.rendered = false;
        this.rail = null;
        this.previousButton = this.element.querySelector('[data-game-scroll-previous]');
        this.nextButton = this.element.querySelector('[data-game-scroll-next]');
        this.statusElement = this.element.querySelector('[data-game-scroll-status]');
    }

    render() {
        if (this.rendered || !this.grid) return;
        this.grid.innerHTML = this.catalog.map((game) => `
            <article class="game-card game-card--${escape(game.accent)} ${game.available ? 'is-available' : 'is-locked'}" data-game-card="${escape(game.id)}" data-scroll-rail-item="${escape(game.id)}" role="listitem" dir="rtl">
                <div class="game-card__glow" aria-hidden="true"></div>
                <div class="game-card__topline">
                    <span class="game-card__icon" aria-hidden="true">${escape(game.icon)}</span>
                    <span class="game-card__status">${game.available ? 'PLAYABLE' : `PHASE ${game.phase}`}</span>
                </div>
                <div>
                    <h3>${escape(game.title)}</h3>
                    <p class="game-card__subtitle">${escape(game.subtitle)}</p>
                    <p class="game-card__description">${escape(game.description)}</p>
                </div>
                <button
                    type="button"
                    class="game-card__action"
                    data-game-launch="${escape(game.id)}"
                    ${game.available ? '' : 'aria-disabled="true"'}
                >
                    ${game.available ? 'ورود به بازی' : 'به‌زودی'}
                    <span aria-hidden="true">←</span>
                </button>
            </article>
        `).join('');
        this.rendered = true;
        this.rail = new ScrollSnapRail({
            viewport: this.grid,
            itemSelector: '[data-game-card]',
            previousButton: this.previousButton,
            nextButton: this.nextButton,
            statusElement: this.statusElement,
            focusSelector: '[data-game-launch]',
        }).boot();
    }

    async beforeOpen() {
        this.render();
        this.rail?.refresh({ preserveIndex: true });
    }

    async afterOpen() {
        this.rail?.updateFromGeometry({ emit: false });
        this.animation?.revealItems(this.element.querySelectorAll('[data-game-card]'), {
            duration: 360,
            delay: 65,
        });
    }

    dispose() {
        this.rail?.dispose();
        this.rail = null;
        super.dispose();
    }
}
