import BaseScreen from './BaseScreen';
import ScrollSnapRail from '../../../ui/ScrollSnapRail.js';
import { gameExperience } from '../../design/GameExperience.js';
import { preloadFbxCafeArt } from '../../rendering2d/FbxCafeAssets.js';
import { optionalAssetPolicy } from '../../characters/runtime/MobileNetworkPolicy.js';
import { prewarmCriticalGameSprite } from '../../performance/GameAssetWarmup.js';

export const shouldWarmOpenWorldPreview = policy =>
    policy?.deferBackground === false && policy.reason === 'normal';

function escape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}


// Guide copy comes from an authored, reviewed contract. Escape every value:
// these cards contain no dynamic HTML sourced from players or the backend.
function renderGameGuide(game) {
    const guide = gameExperience(game.id);
    if (!guide) return '';
    const steps = guide.tutorialFa.map(step => `<li>${escape(step)}</li>`).join('');
    return `
        <div class="game-card__guide" data-game-design-guide="${escape(game.id)}">
            <p class="game-card__goal"><strong>هدف:</strong> ${escape(guide.goalFa)}</p>
            <details class="game-card__guide-details">
                <summary>راهنمای بازی، سختی و رقابت</summary>
                <div class="game-card__guide-body">
                    <ol class="game-card__learning-steps" aria-label="سه گام شروع بازی">${steps}</ol>
                    <p><strong>لمس:</strong> ${escape(guide.controls.touchFa)}</p>
                    <p><strong>کیبورد:</strong> ${escape(guide.controls.keyboardFa)}</p>
                    <p><strong>شروع:</strong> ${escape(guide.difficultyFa.intro)}</p>
                    <p><strong>تمرین:</strong> ${escape(guide.difficultyFa.practice)}</p>
                    <p><strong>مهارت:</strong> ${escape(guide.difficultyFa.mastery)}</p>
                    <p class="game-card__mode-note"><strong>تمرینی:</strong> ${escape(guide.modes.practiceFa)}</p>
                    <p class="game-card__mode-note"><strong>رقابتی:</strong> ${escape(guide.modes.rankedFa)}</p>
                </div>
            </details>
        </div>
    `;
}

export default class GameSelectionScreen extends BaseScreen {
    constructor({ catalog, registry = null, visuals = null, ...options }) {
        super(options);
        this.catalog = catalog;
        this.registry = registry;
        this.visuals = visuals;
        this.prefetched = new Set();
        this.prefetchTimer = null;
        this.onPrefetchIntent = event => this.prefetchIntent(event);
        this.onPressIntent = event => {
            if (event.isPrimary === false || event.button !== 0) return;
            const button = event.target?.closest?.('[data-game-launch]');
            const gameId = button?.dataset.gameLaunch;
            if (!gameId || !this.catalog.some(game => game.available && game.id === gameId)) return;
            this.prefetchGame(gameId);
        };
        this.onPrefetchExit = () => this.clearPrefetchTimer();
        this.grid = this.element.querySelector('[data-game-grid]');
        this.rendered = false;
        this.warmupHandle = null;
        this.warmupType = null;
        this.rail = null;
        this.previousButton = this.element.querySelector('[data-game-scroll-previous]');
        this.nextButton = this.element.querySelector('[data-game-scroll-next]');
        this.statusElement = this.element.querySelector('[data-game-scroll-status]');
    }

    render() {
        if (this.rendered || !this.grid) return;
        const playableCount = this.catalog.filter(game => game.available).length;
        const count = this.element.querySelector('[data-game-library-count]');
        if (count) count.textContent = `${playableCount.toLocaleString('fa-IR')} بازی آمادهٔ اجرا`;
        this.grid.innerHTML = this.catalog.map((game) => `
            <article class="game-card game-card--${escape(game.accent)} ${game.available ? 'is-available' : 'is-locked'}" data-game-card="${escape(game.id)}" data-scroll-rail-item="${escape(game.id)}" role="listitem" dir="rtl">
                <div class="game-card__glow" aria-hidden="true"></div>
                <div class="game-card__scene-preview" aria-hidden="true">
                    <img loading="lazy" decoding="async"
                        src="${game.id === 'dino-run'
                            ? 'assets/environments/cafe-runner-v1/interior.webp'
                            : 'assets/environments/demian-fbx/polished-v1/preview.webp'}"
                        alt="" width="320" height="180">
                    <span>نمای محیط کافه</span>
                </div>
                <div class="game-card__topline">
                    <span class="game-card__icon" aria-hidden="true">${escape(game.icon)}</span>
                    <span class="game-card__status" aria-label="${game.available ? 'قابل اجرا' : 'در دست ساخت'}">${game.available ? 'آمادهٔ بازی' : `فاز ${game.phase}`}</span>
                </div>
                <div>
                    <h3>${escape(game.title)}</h3>
                    <p class="game-card__subtitle">${escape(game.subtitle)}</p>
                    <p class="game-card__description">${escape(game.description)}</p>
                </div>
                ${renderGameGuide(game)}
                <button
                    type="button"
                    class="game-card__action"
                    data-game-launch="${escape(game.id)}"
                    aria-label="${game.available ? `اجرای ${escape(game.title)}، ${escape(game.subtitle)}` : `${escape(game.title)} هنوز فعال نیست`}"
                    ${game.available ? '' : 'aria-disabled="true"'}
                >
                    ${game.available ? 'ورود به بازی' : 'به‌زودی'}
                    <span aria-hidden="true">←</span>
                </button>
            </article>
        `).join('');
        this.rendered = true;
        // Fetch only an explicitly hovered or keyboard-focused module; do not
        // fan out into all six downloads on mobile, Save-Data or 3G.
        this.grid.addEventListener('pointerover', this.onPrefetchIntent);
        this.grid.addEventListener('pointerdown', this.onPressIntent);
        this.grid.addEventListener('focusin', this.onPrefetchIntent);
        this.grid.addEventListener('pointerout', this.onPrefetchExit);
        this.rail = new ScrollSnapRail({
            viewport: this.grid,
            itemSelector: '[data-game-card]',
            previousButton: this.previousButton,
            nextButton: this.nextButton,
            statusElement: this.statusElement,
            focusSelector: '[data-game-launch]',
        }).boot();
    }

    clearPrefetchTimer() {
        if (this.prefetchTimer !== null) globalThis.clearTimeout(this.prefetchTimer);
        this.prefetchTimer = null;
    }

    prefetchIntent(event) {
        if (event.type === 'pointerover' && event.pointerType === 'touch') return;
        if (!this.registry || optionalAssetPolicy().reason !== 'normal') return;
        const card = event.target?.closest?.('[data-game-card]');
        const gameId = card?.dataset.gameCard;
        if (!gameId || !this.catalog.some(game => game.available && game.id === gameId)
            || this.prefetched.has(gameId) || this.prefetched.size >= 2) return;
        this.clearPrefetchTimer();
        this.prefetchTimer = globalThis.setTimeout(() => {
            this.prefetchTimer = null;
            this.prefetchGame(gameId);
        }, 160);
    }

    prefetchGame(gameId) {
        if (!this.registry || optionalAssetPolicy().reason !== 'normal'
            || this.prefetched.has(gameId) || this.prefetched.size >= 2) return;
        this.prefetched.add(gameId);
        void prewarmCriticalGameSprite(gameId, this.visuals);
        void this.registry.load(gameId).catch(() => this.prefetched.delete(gameId));
    }

    async beforeOpen() {
        this.render();
        this.rail?.refresh({ preserveIndex: true });
        if (this.warmupHandle !== null || !shouldWarmOpenWorldPreview(optionalAssetPolicy())) return;
        // Begin idle warmup without blocking the visible game-selection menu.
        const warm = () => {
            this.warmupHandle = null;
            if (this.element.hidden) return;
            // Once selection is visible, prewarm only the active character used
            // by Open World/Dino Run. No bulk atlas or NPC downloads.
            void prewarmCriticalGameSprite('open-world', this.visuals);
            void preloadFbxCafeArt();
        };
        if (typeof globalThis.requestIdleCallback === 'function') {
            this.warmupType = 'idle';
            this.warmupHandle = globalThis.requestIdleCallback(warm, { timeout: 1000 });
        } else {
            this.warmupType = 'timer';
            this.warmupHandle = globalThis.setTimeout(warm, 250);
        }
    }

    async afterOpen() {
        this.rail?.updateFromGeometry({ emit: false });
        this.animation?.revealItems(this.element.querySelectorAll('[data-game-card]'), {
            duration: 360,
            delay: 65,
        });
    }

    cancelWarmup() {
        if (this.warmupHandle === null) return;
        if (this.warmupType === 'idle') globalThis.cancelIdleCallback?.(this.warmupHandle);
        else globalThis.clearTimeout(this.warmupHandle);
        this.warmupHandle = null;
    }

    async beforeClose() {
        this.clearPrefetchTimer();
        this.cancelWarmup();
    }

    dispose() {
        this.clearPrefetchTimer();
        this.grid?.removeEventListener('pointerover', this.onPrefetchIntent);
        this.grid?.removeEventListener('pointerdown', this.onPressIntent);
        this.grid?.removeEventListener('focusin', this.onPrefetchIntent);
        this.grid?.removeEventListener('pointerout', this.onPrefetchExit);
        this.cancelWarmup();
        this.rail?.dispose();
        this.rail = null;
        super.dispose();
    }
}
