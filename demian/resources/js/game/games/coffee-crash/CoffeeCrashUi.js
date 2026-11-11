import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';
import { COLS, ROWS, INGREDIENTS, LEVELS, SPECIAL_LABELS, digits } from './CoffeeCrashData.js';
import { ingredientArt } from './CoffeeCrashArt.js';
const n = value => digits.format(value);
const GUIDE = `<p>دو خوراکیِ کنار هم را جابه‌جا کن تا حداقل سه تای یکسان در یک ردیف یا ستون قرار بگیرند. سفارش‌های بالای صفحه را پیش از تمام شدن حرکت‌ها آماده کن.</p>
    <ul><li>۴تایی: فنجان راه‌راه، پاک‌کنندهٔ یک ردیف یا ستون.</li><li>شکل T یا L: بمب قهوه، پاک‌کنندهٔ خانه‌های اطراف.</li><li>۵تایی: فنجان رنگین؛ با هر خوراکی جابه‌جا شود، همان رنگ را جمع می‌کند.</li><li>دو آیتم ویژه را کنار هم جابه‌جا کن تا هر دو فعال شوند.</li></ul>
    <p>لمس: روی دو خانه بزن یا یک خانه را به جهت همسایه بکش. صفحه‌کلید: فلش‌ها برای جابه‌جایی نشانگر و Enter یا Space برای انتخاب. دسته: جهت‌ها و دکمهٔ تأیید.</p>
    <p>حرکت نامعتبر رایگان است. راهنما رایگان است. هر مرحله یک بار بازگشت حرکت دارد. صفحهٔ بدون حرکت خودکار بازچینی می‌شود.</p>`;

export default class CoffeeCrashUi {
    constructor(root, actions) {
        this.actions = actions;
        this.selected = null;
        this.focused = 0;
        this.blocked = false;
        this.motionReduced = root.dataset.motion === 'reduced';
        this.hud = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.hud.className = 'coffee-hud';
        this.hud.setAttribute('aria-label', 'جورچین قهوه');
        this.hud.innerHTML = `<div class="coffee-worktop" data-gamepad-scope>
            <header class="coffee-heading"><div><span class="coffee-eyebrow" lang="en" dir="ltr">DEMIAN / COFFEE CRASH</span><h2>یک فنجان، یک ترکیب</h2><p data-coffee-level></p></div><span class="coffee-seal" aria-hidden="true">d<span>کافه دمیان</span></span></header>
            <div class="coffee-order"><div class="coffee-moves"><span>حرکت</span><b data-coffee-moves></b></div><div class="coffee-receipt"><span class="coffee-eyebrow">سفارش این نوبت</span><div data-coffee-goals></div></div></div>
            <div class="coffee-tray"><div class="coffee-grid" role="grid" aria-label="سینی جورچین، هفت ستون و هشت ردیف" aria-rowcount="8" aria-colcount="7" dir="ltr">${Array.from({ length: ROWS }, (_, row) => `<div class="coffee-row" role="row">${Array.from({ length: COLS }, (_, col) => `<div role="gridcell" aria-rowindex="${row + 1}" aria-colindex="${col + 1}"><button type="button" data-coffee-cell="${row * COLS + col}" tabindex="${row + col === 0 ? 0 : -1}" aria-pressed="false"><span class="coffee-piece"></span><span class="coffee-special" aria-hidden="true"></span></button></div>`).join('')}</div>`).join('')}</div></div>
            <div class="coffee-summary"><span>امتیاز <b data-coffee-score>۰</b></span><span data-coffee-chain>با حوصله ترکیب بساز</span><span data-coffee-best></span></div>
            <footer class="coffee-tools"><button type="button" data-coffee-action="hint">✧ راهنما</button><button type="button" data-coffee-action="undo">↶ یک حرکت قبل</button><button type="button" data-coffee-action="help">؟ روش بازی</button></footer>
            <p class="coffee-feedback" role="status" aria-live="polite" data-coffee-feedback>دو خوراکیِ همسایه را جابه‌جا کن.</p>
        </div>`;
        root.querySelector('[data-game-hud-host]').append(this.hud);
        this.cells = [...this.hud.querySelectorAll('[data-coffee-cell]')];
        this.nodes = Object.fromEntries(['level', 'moves', 'goals', 'score', 'chain', 'best', 'feedback'].map(id => [id, this.hud.querySelector(`[data-coffee-${id}]`)]));
        this.undoButton = this.hud.querySelector('[data-coffee-action="undo"]');
        this.hud.addEventListener('click', event => {
            const cell = event.target.closest('[data-coffee-cell]');
            if (cell) {
                if (this.suppressClick === Number(cell.dataset.coffeeCell)) { this.suppressClick = null; return; }
                actions.select(Number(cell.dataset.coffeeCell));
            }
            const button = event.target.closest('[data-coffee-action]');
            if (button) actions.action(button.dataset.coffeeAction);
        });
        this.hud.addEventListener('keydown', event => this.keydown(event));
        this.hud.addEventListener('pointerdown', event => {
            const button = event.target.closest('[data-coffee-cell]');
            if (!button || this.blocked || event.isPrimary === false || event.button !== 0) return;
            this.suppressClick = null;
            this.pointer = { id: event.pointerId, index: Number(button.dataset.coffeeCell), x: event.clientX, y: event.clientY };
            button.setPointerCapture(event.pointerId);
        });
        this.hud.addEventListener('pointerup', event => {
            const start = this.pointer;
            this.pointer = null;
            if (!start || start.id !== event.pointerId || this.blocked) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
            const target = start.index + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * COLS);
            this.suppressClick = start.index;
            actions.swap(start.index, target);
        });
        this.hud.addEventListener('pointercancel', () => { this.pointer = null; });
        this.dialog = assignUiLayer(document.createElement('dialog'), UI_LAYER.LOCAL_BASE);
        this.dialog.className = 'coffee-dialog';
        this.dialog.dataset.gameDialog = 'coffee-crash';
        this.dialog.setAttribute('aria-labelledby', 'coffee-dialog-title');
        this.dialog.innerHTML = `<span class="coffee-eyebrow" lang="en" dir="ltr">DEMIAN / COFFEE CRASH</span><h2 id="coffee-dialog-title">جورچین قهوه</h2><div class="coffee-guide">${GUIDE}</div><fieldset class="coffee-levels"><legend>مرحله را انتخاب کن</legend>${LEVELS.map(level => `<button type="button" data-coffee-level-choice="${level.id}" aria-pressed="false"><b>${n(level.id)}</b><span>${level.name}</span><small></small></button>`).join('')}</fieldset><div class="coffee-dialog-actions"><button type="button" data-coffee-dialog-action="start" data-shift-action="confirm">شروع سفارش</button><button type="button" data-coffee-dialog-action="skip">متوجه شدم و دیگر نمایش نده</button><button type="button" data-coffee-dialog-action="close">بازگشت</button></div>`;
        root.querySelector('[data-game-overlay-host]').append(this.dialog);
        this.dialog.addEventListener('click', event => {
            const choice = event.target.closest('[data-coffee-level-choice]');
            if (choice && !choice.disabled) this.chooseLevel(Number(choice.dataset.coffeeLevelChoice));
            const button = event.target.closest('[data-coffee-dialog-action]');
            if (button) actions.dialog(button.dataset.coffeeDialogAction);
        });
        this.dialog.addEventListener('keydown', event => event.stopPropagation());
        this.dialog.addEventListener('cancel', event => { event.preventDefault(); actions.dialog('close'); });
    }

    keydown(event) {
        const button = event.target.closest('[data-coffee-cell]');
        if (!button) return;
        const index = Number(button.dataset.coffeeCell);
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
        if (Object.hasOwn(offsets, event.key)) {
            event.preventDefault();
            event.stopPropagation();
            const next = index + offsets[event.key];
            const inRow = Math.abs(offsets[event.key]) !== 1 || Math.floor(index / COLS) === Math.floor(next / COLS);
            if (inRow && next >= 0 && next < this.cells.length) this.focus(next);
        } else if (event.key === 'Escape' && this.selected !== null) {
            event.preventDefault();
            event.stopPropagation();
            this.select(null);
        }
    }

    focus(index) {
        this.cells[this.focused].tabIndex = -1;
        this.focused = index;
        this.cells[index].tabIndex = 0;
        this.cells[index].focus({ preventScroll: true });
    }

    select(index) {
        this.selected = index;
        this.cells.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    }

    hint(pair) {
        this.cells.forEach((button, i) => button.dataset.hint = String(pair?.includes(i) ?? false));
        if (pair) {
            this.say(`راهنما: خانهٔ ردیف ${n(Math.floor(pair[0] / COLS) + 1)}، ستون ${n(pair[0] % COLS + 1)} را با خانهٔ مشخص‌شده جابه‌جا کن.`);
            this.focus(pair[0]);
        }
    }

    block(value) {
        this.blocked = value;
        this.hud.setAttribute('aria-busy', String(value));
        this.cells.forEach(button => button.setAttribute('aria-disabled', String(value)));
    }

    draw(frame, model, store) {
        const { board, cleared = [], affected = [] } = frame;
        this.nodes.level.textContent = `مرحلهٔ ${n(model.level.id)} · ${model.level.name}`;
        this.nodes.moves.textContent = n(frame.moves);
        this.hud.dataset.urgent = String(frame.moves <= 5);
        this.nodes.score.textContent = n(frame.score);
        this.nodes.best.textContent = `بهترین ${n(store.records[model.level.id]?.score ?? 0)}`;
        this.nodes.goals.innerHTML = model.level.goals.map(goal => {
            const count = Math.min(goal.count, frame.collected[goal.type]);
            const complete = count === goal.count;
            return `<div class="coffee-goal" data-complete="${complete}" aria-label="${INGREDIENTS[goal.type].label}: ${n(count)} از ${n(goal.count)}">${ingredientArt(goal.type)}<span><b dir="ltr">${n(count)} / ${n(goal.count)}</b><small>${complete ? 'آماده ✓' : INGREDIENTS[goal.type].label}</small></span></div>`;
        }).join('');
        if (frame.chain) this.nodes.chain.textContent = frame.chain > 1 ? `آبشار ×${n(frame.chain)} · عالی بود!` : 'سفارش در حال آماده شدن…';
        for (let i = 0; i < board.length; i++) {
            const tile = board[i];
            const button = this.cells[i];
            const key = `${tile.type}/${tile.special}`;
            const piece = button.querySelector('.coffee-piece');
            const changed = button.dataset.tile !== key;
            if (changed) {
                button.dataset.tile = key;
                piece.innerHTML = ingredientArt(tile.type);
                button.querySelector('.coffee-special').textContent = ({ row: '↔', column: '↕', bomb: '✦', rainbow: '✺' })[tile.special] ?? '';
                button.dataset.special = tile.special ?? '';
                button.setAttribute('aria-label', `${INGREDIENTS[tile.type].label}${tile.special ? '، ' + SPECIAL_LABELS[tile.special] : ''}، ردیف ${n(Math.floor(i / COLS) + 1)}، ستون ${n(i % COLS + 1)}`);
            }
            button.dataset.clearing = String(cleared.includes(i));
            button.dataset.hint = 'false';
            if (!this.motionReduced && typeof piece.animate === 'function') {
                if (frame.kind === 'swap' && affected.includes(i)) {
                    const other = affected.find(at => at !== i);
                    const rect = button.getBoundingClientRect();
                    const target = this.cells[other].getBoundingClientRect();
                    piece.animate([{ transform: `translate(${target.x - rect.x}px, ${target.y - rect.y}px)` }, { transform: 'translate(0, 0)' }], { duration: 160, easing: 'ease-out' });
                } else if (frame.kind === 'fall' && changed) {
                    piece.animate([{ transform: 'translateY(-45%)', opacity: .3 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 190, easing: 'cubic-bezier(.2,.7,.3,1)' });
                }
            }
        }
        this.undoButton.disabled = this.blocked || !model.history || model.usedUndo || model.status !== 'playing';
    }

    chooseLevel(level) {
        this.level = level;
        for (const button of this.dialog.querySelectorAll('[data-coffee-level-choice]')) button.setAttribute('aria-pressed', String(Number(button.dataset.coffeeLevelChoice) === level));
    }

    show(view, store, level) {
        this.view = view;
        this.pointer = null;
        const entry = view === 'entry';
        this.dialog.querySelector('h2').textContent = entry ? 'سفارش بعدی تو چیست؟' : 'راهنمای جورچین قهوه';
        this.dialog.querySelector('.coffee-guide').hidden = entry && store.skipGuide;
        this.dialog.querySelector('.coffee-levels').hidden = !entry;
        this.dialog.querySelector('[data-coffee-dialog-action="skip"]').hidden = !entry || store.skipGuide;
        this.dialog.querySelector('[data-coffee-dialog-action="start"]').textContent = entry ? 'شروع سفارش' : 'متوجه شدم';
        this.dialog.querySelector('[data-coffee-dialog-action="close"]').hidden = !entry;
        for (const button of this.dialog.querySelectorAll('[data-coffee-level-choice]')) {
            const id = Number(button.dataset.coffeeLevelChoice);
            button.disabled = id > store.unlocked;
            button.querySelector('small').textContent = store.records[id] ? '★'.repeat(store.records[id].stars) : id > store.unlocked ? 'قفل' : 'آماده';
        }
        this.chooseLevel(level);
        if (!this.dialog.open) this.dialog.showModal();
        this.dialog.querySelector('[data-coffee-dialog-action="start"]').focus();
    }
    close() { if (this.dialog.open) this.dialog.close(); this.view = null; }
    say(text) { this.nodes.feedback.textContent = text; }
    pause() { for (const animation of this.hud.getAnimations({ subtree: true })) animation.pause(); this.pointer = null; }
    resume() { for (const animation of this.hud.getAnimations({ subtree: true })) animation.play(); }
    dispose() { this.close(); this.hud.remove(); this.dialog.remove(); }
}
