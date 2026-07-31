import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';
import { cellsFor, TETROMINO_COLORS } from '../domain/Tetrominoes.js';

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

function formatNumber(value) {
    return NUMBER_FORMATTER.format(Math.max(0, Math.floor(Number(value) || 0)));
}

function colorHex(type) {
    return `#${TETROMINO_COLORS[type].toString(16).padStart(6, '0')}`;
}

function piecePreview(type, label) {
    if (!type) {
        return `<div class="tetris-mini-piece is-empty" aria-label="${label}: خالی"></div>`;
    }

    const occupied = new Set(cellsFor(type, 0).map(({ x, y }) => `${x}:${y}`));
    const cells = Array.from({ length: 16 }, (_, index) => {
        const x = index % 4;
        const y = Math.floor(index / 4);
        const active = occupied.has(`${x}:${y}`);
        return `<i${active ? ` class="is-filled" style="--piece-color:${colorHex(type)}"` : ''}></i>`;
    }).join('');

    return `<div class="tetris-mini-piece" aria-label="${label}: ${type}">${cells}</div>`;
}

export default class TetrisHud {
    constructor({ root, animation, profile = {} } = {}) {
        this.root = root;
        this.animation = animation;
        this.profile = profile;
        this.element = null;
        this.lastQueueSignature = '';
        this.lastHold = undefined;
        this.bannerTimer = null;
        this.lastValues = Object.create(null);
    }

    mount() {
        const host = this.root.querySelector('[data-game-hud-host]');
        if (!host || this.element) return;

        const element = document.createElement('section');
        element.className = 'tetris-hud';
        assignUiLayer(element, UI_LAYER.LOCAL_BASE);
        element.dataset.gameHud = 'tetris';
        element.dataset.gameplayUi = '';
        element.setAttribute('aria-label', 'رابط بازی تتریس');
        element.innerHTML = `
            <header class="tetris-hud__top" dir="ltr">
                <div class="tetris-hud__brand"><span>▦</span><div><small>CAFÉ DEMIAN</small><strong>TETRIS</strong></div></div>
                <div class="tetris-hud__stats">
                    <span><small>SCORE</small><b data-tetris-score>0</b></span>
                    <span><small>HIGH</small><b data-tetris-high>0</b></span>
                    <span><small>LEVEL</small><b data-tetris-level>1</b></span>
                    <span><small>LINES</small><b data-tetris-lines>0</b></span>
                </div>
                <div class="tetris-hud__actions">
                    <button type="button" data-shell-action="pause" aria-label="توقف بازی">Ⅱ</button>
                    <button type="button" data-shell-action="exit-game" aria-label="خروج به کافه">×</button>
                </div>
            </header>

            <aside class="tetris-hud__side tetris-hud__side--hold" dir="ltr">
                <small>HOLD</small>
                <div data-tetris-hold>${piecePreview(null, 'Hold')}</div>
                <span data-tetris-hold-state>READY</span>
            </aside>

            <aside class="tetris-hud__side tetris-hud__side--next" dir="ltr">
                <small>NEXT</small>
                <div data-tetris-next class="tetris-next-list"></div>
            </aside>

            <div data-tetris-banner class="tetris-hud__banner" role="status" aria-live="polite"></div>

            <footer class="tetris-hud__footer" dir="ltr">
                <span><b>← →</b> MOVE</span>
                <span><b>↓</b> SOFT DROP</span>
                <span><b>SPACE</b> HARD DROP</span>
                <span><b>↑ / X</b> ROTATE</span>
                <span><b>Z</b> ROTATE CCW</span>
                <span><b>C</b> HOLD</span>
                <span data-tetris-seed>SEED · —</span>
            </footer>

            <div data-control-surface="tetris" class="tetris-touch-controls" dir="ltr" aria-label="کنترل‌های لمسی تتریس">
                <button type="button" data-input-hold="moveLeft" aria-label="حرکت چپ">←</button>
                <button type="button" data-input-hold="moveRight" aria-label="حرکت راست">→</button>
                <button type="button" data-input-hold="softDrop" aria-label="پایین سریع">↓</button>
                <button type="button" data-input-press="rotateCounterClockwise" aria-label="چرخش پادساعتگرد">↶</button>
                <button type="button" data-input-press="rotateClockwise" aria-label="چرخش ساعتگرد">↷</button>
                <button type="button" data-input-press="hold" aria-label="نگه‌داشتن قطعه">HOLD</button>
                <button type="button" data-input-press="hardDrop" class="is-primary" aria-label="رهاسازی سریع">DROP</button>
            </div>
        `;
        host.appendChild(element);
        this.element = element;
        this.refs = {
            score: element.querySelector('[data-tetris-score]'),
            high: element.querySelector('[data-tetris-high]'),
            level: element.querySelector('[data-tetris-level]'),
            lines: element.querySelector('[data-tetris-lines]'),
            hold: element.querySelector('[data-tetris-hold]'),
            holdState: element.querySelector('[data-tetris-hold-state]'),
            next: element.querySelector('[data-tetris-next]'),
            banner: element.querySelector('[data-tetris-banner]'),
            seed: element.querySelector('[data-tetris-seed]'),
        };
        this.animation?.reveal(element, { duration: 320 });
    }

    setProfile(profile) {
        this.profile = profile ?? {};
        if (this.refs?.high) {
            const high = formatNumber(this.profile.highScore);
            this.refs.high.textContent = high;
            this.lastValues.high = high;
        }
    }

    update(snapshot) {
        if (!this.element || !snapshot) return;
        const { scoring } = snapshot;
        const values = {
            score: formatNumber(scoring.score),
            level: String(scoring.level),
            lines: String(scoring.lines),
            high: formatNumber(Math.max(this.profile.highScore ?? 0, scoring.score)),
            seed: `${snapshot.isReplay ? 'REPLAY' : 'SEED'} · ${snapshot.seed ?? '—'}`,
        };
        Object.entries(values).forEach(([key, value]) => {
            if (this.lastValues[key] !== value) {
                this.refs[key].textContent = value;
                this.lastValues[key] = value;
            }
        });

        if (this.lastHold !== snapshot.heldPiece) {
            this.refs.hold.innerHTML = piecePreview(snapshot.heldPiece, 'Hold');
            this.lastHold = snapshot.heldPiece;
        }
        this.refs.holdState.textContent = snapshot.holdAvailable ? 'READY' : 'USED';
        this.refs.holdState.classList.toggle('is-disabled', !snapshot.holdAvailable);

        const queueSignature = snapshot.nextQueue.join('');
        if (queueSignature !== this.lastQueueSignature) {
            this.refs.next.innerHTML = snapshot.nextQueue
                .map((type, index) => `<div class="tetris-next-item"><span>${index + 1}</span>${piecePreview(type, `Next ${index + 1}`)}</div>`)
                .join('');
            this.lastQueueSignature = queueSignature;
        }
    }

    announce(message, tone = 'info') {
        if (!this.refs?.banner || !message) return;
        window.clearTimeout(this.bannerTimer);
        this.refs.banner.textContent = message;
        this.refs.banner.dataset.tone = tone;
        this.refs.banner.classList.add('is-visible');
        this.animation?.reveal(this.refs.banner, { duration: 160 });
        this.bannerTimer = window.setTimeout(() => {
            this.refs?.banner?.classList.remove('is-visible');
        }, 1200);
    }

    setPaused(paused) {
        this.element?.classList.toggle('is-paused', paused);
    }

    dispose() {
        window.clearTimeout(this.bannerTimer);
        this.element?.remove();
        this.element = null;
        this.refs = null;
        this.lastValues = Object.create(null);
    }
}
