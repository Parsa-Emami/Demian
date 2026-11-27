import BaseScreen from './BaseScreen';
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

function renderGameGuide(game) {
    const guide = gameExperience(game.id);
    if (!guide) return '';
    const steps = guide.tutorialFa.map(step => `<li>${escape(step)}</li>`).join('');
    return `
        <div class="game-card__guide" data-game-design-guide="${escape(game.id)}">
            <details class="game-card__guide-details" name="demian-library-guide">
                <summary aria-label="راهنمای ${escape(game.title)}" title="راهنمای بازی">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.7 1c-.7 1-2.4 1.3-2.4 3m0 3h.01"/></svg>
                </summary>
                <div class="game-card__guide-body">
                    <p class="game-card__goal"><strong>هدف:</strong> ${escape(guide.goalFa)}</p>
                    <p>${escape(game.description)}</p>
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

function renderGameCard(game, featured) {
    const label = game.available ? `اجرای ${game.title}، ${game.subtitle}` : `${game.title} هنوز فعال نیست`;
    return `
        <article class="demian-game${featured ? ' demian-game--featured' : ''}" data-game-card="${escape(game.id)}" role="listitem">
            <button type="button" class="demian-game__launch" data-game-launch="${escape(game.id)}"
                aria-label="${escape(label)}" ${game.available ? '' : 'aria-disabled="true"'}>
                <span class="demian-game__art game-card__scene-preview" aria-hidden="true">
                    <img src="${escape(game.cover ?? 'assets/environments/cafe-runner-v1/interior.webp')}" alt=""
                        width="${featured ? '960' : '400'}" height="${featured ? '600' : '250'}"
                        loading="${featured ? 'eager' : 'lazy'}" decoding="async">
                    ${featured ? '<span class="demian-game__capture-label">نمای داخل بازی</span>' : ''}
                    <span class="demian-game__play">
                        ${game.available
                            ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6v12l9-6z"/></svg>'
                            : 'به‌زودی'}
                    </span>
                </span>
                <span class="demian-game__caption">
                    ${featured
                        ? `<strong lang="en" dir="ltr">${escape(game.title)}</strong><span>${escape(game.subtitle)}</span>`
                        : `<strong>${escape(game.subtitle)}</strong><span lang="en" dir="ltr">${escape(game.title)}</span>`}
                </span>
            </button>
            ${renderGameGuide(game)}
        </article>
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
    }

    render() {
        if (this.rendered || !this.grid) return;
        const playableCount = this.catalog.filter(game => game.available).length;
        const count = this.element.querySelector('[data-game-library-count]');
        if (count) count.textContent = `${playableCount.toLocaleString('fa-IR')} بازی آمادهٔ اجرا`;
        const featured = this.catalog.find(game => game.id === 'dino-run' && game.available);
        const games = featured ? [featured, ...this.catalog.filter(game => game !== featured)] : this.catalog;
        this.grid.innerHTML = games.map(game => renderGameCard(game, game === featured)).join('');
        this.rendered = true;
        // Fetch only an explicitly hovered or keyboard-focused module; do not
        // fan out into all six downloads on mobile, Save-Data or 3G.
        this.grid.addEventListener('pointerover', this.onPrefetchIntent);
        this.grid.addEventListener('pointerdown', this.onPressIntent);
        this.grid.addEventListener('focusin', this.onPrefetchIntent);
        this.grid.addEventListener('pointerout', this.onPrefetchExit);
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
        super.dispose();
    }
}
