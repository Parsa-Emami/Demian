import setTouchInteractionLabel from '../../input/TouchInteractionLabel.js';
import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';
import { RECIPES, RUSH_RULES, RUSH_SPOTS, VIP_AT, rushObjective } from './CafeRushMap.js';

export const rushDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const timerDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false, minimumIntegerDigits: 2 });
const STATES = Object.freeze({
    waiting: 'روی پیشخوان', accepted: 'در دست آماده‌سازی', preparing: 'آماده می‌شود', ready: 'آمادهٔ برداشتن', carrying: 'روی سینی',
});
const TARGETS = Object.fromEntries(RUSH_SPOTS.map((spot) => [spot.id, spot.label]));
const BRIEFING = `
    <p>از پیشخوان برگه بگیر، خوراکی را در ایستگاه آماده کن و سینی را به میز درست برسان.</p>
    <p>در گوشی، نمای افقی فضای بیشتری برای دنبال کردن مقصدها دارد.</p>
    <p>دو دقیقه برای پر کردن سهمیه وقت داری. در پیچ آهسته شو تا سینی نریزد. هر سه تحویل پیاپی ۵۰ امتیاز اضافه دارد.</p>
    <p>در ۳۰ ثانیهٔ پایانی سفارش ویژهٔ اوزودی به میز ۲ می‌رسد.</p>
    <div class="shift-guide__controls">
        <span class="shift-guide__keyboard">حرکت <kbd>WASD / ↑↓←→</kbd> · دویدن <kbd>Shift</kbd> · تعامل <kbd>E</kbd></span>
        <span class="shift-guide__touch">جوی‌استیک · دکمهٔ «دویدن» · دکمهٔ «تعامل» کنار ایستگاه</span>
    </div>
`;

function clock(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${timerDigits.format(Math.floor(value / 60))}:${timerDigits.format(value % 60)}`;
}

function text(element, value) {
    if (element.textContent !== value) element.textContent = value;
}

export default class CafeRushUi {
    constructor(root, onAction) {
        this.touchLabel = root.querySelector('[data-touch-interact-label]');
        this.hud = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.hud.className = 'rush-hud';
        this.hud.setAttribute('aria-label', 'وضعیت سفارش آخر');
        this.hud.innerHTML = `
            <div class="game-readout__rail">
                <div class="game-readout__stats">
                    <div class="shift-hud__meter"><span>زمان مانده</span><time data-rush-time dir="ltr"></time></div>
                    <div class="shift-hud__meter"><span>تحویل</span><b data-rush-served dir="ltr"></b></div>
                </div>
                <div class="game-readout__state">
                    <strong data-rush-goal role="status"></strong>
                    <span data-rush-urgent hidden></span>
                </div>
                <details class="game-readout__details">
                    <summary>صف سفارش‌ها</summary>
                    <div class="game-readout__body">
                        <div class="game-readout__meta">
                            <span data-rush-level></span><span>امتیاز <b data-rush-score></b></span>
                            <span>زنجیره <b data-rush-combo></b></span><span data-rush-vip></span>
                        </div>
                        <div class="rush-tickets" data-rush-tickets aria-label="صف سفارش‌ها"></div>
                        <div class="rush-notice"><strong>ستایش · پیشخوان</strong><span data-rush-notice></span></div>
                    </div>
                </details>
            </div>
            <div class="rush-hud__bottom">
                <div class="rush-prompt" data-rush-prompt hidden></div>
                <div class="rush-tray" data-rush-tray hidden>
                    <strong data-rush-destination></strong>
                    <span data-rush-risk></span>
                    <meter data-rush-balance min="0" max="1" low=".34" high=".68" optimum="1" aria-label="تعادل سینی"></meter>
                </div>

            </div>
        `;
        root.querySelector('[data-game-hud-host]').append(this.hud);
        this.nodes = Object.fromEntries([
            'level', 'time', 'served', 'score', 'combo', 'vip', 'tickets', 'tray', 'destination', 'balance', 'risk', 'notice', 'prompt', 'goal', 'urgent',
        ].map((id) => [id, this.hud.querySelector(`[data-rush-${id}]`)]));
        this.tickets = new Map();
        this.empty = document.createElement('span');
        this.empty.className = 'rush-tickets__empty';
        this.empty.textContent = 'پیشخوان منتظر سفارش است.';
        this.nodes.tickets.append(this.empty);

        this.dialog = assignUiLayer(document.createElement('dialog'), UI_LAYER.LOCAL_BASE);
        this.dialog.className = 'shift-dialog rush-dialog';
        this.dialog.dataset.gameDialog = 'cafe-rush';
        this.dialog.setAttribute('aria-labelledby', 'cafe-rush-dialog-title');
        this.dialog.innerHTML = `
            <div class="shift-dialog__header">
                <span class="shift-dialog__badge" aria-hidden="true">▤</span>
                <div><p lang="en" dir="ltr">DEMIAN / CAFÉ RUSH</p><h2 id="cafe-rush-dialog-title">سفارش آخر</h2></div>
            </div>
            <div class="shift-guide" data-rush-briefing>${BRIEFING}</div>
            <fieldset class="shift-levels" data-rush-levels>
                <legend>درجهٔ سختی · ۲ دقیقه</legend>
                ${Object.entries(RUSH_RULES).map(([id, rules]) => `<button type="button" data-rush-choice="${id}" aria-pressed="false">
                    <span><strong>${rules.label}</strong><b>${rushDigits.format(rules.level)} از ۱۰</b></span>
                    <small>${rushDigits.format(rules.quota)} تحویل · ${rushDigits.format(rules.capacity)} سفارش هم‌زمان</small>
                </button>`).join('')}
            </fieldset>
            <div class="shift-dialog__actions">
                <button type="button" data-shift-action="confirm" data-rush-action="confirm">متوجه شدم</button>
                <button type="button" data-rush-action="skip-guide">دیگر نمایش نده</button>
                <button type="button" data-rush-action="cancel" class="shift-dialog__cancel">بازگشت</button>
            </div>
        `;
        root.querySelector('[data-game-overlay-host]').append(this.dialog);
        this.choices = [...this.dialog.querySelectorAll('[data-rush-choice]')];
        this.briefing = this.dialog.querySelector('[data-rush-briefing]');
        this.levels = this.dialog.querySelector('[data-rush-levels]');
        this.confirm = this.dialog.querySelector('[data-rush-action="confirm"]');
        this.skip = this.dialog.querySelector('[data-rush-action="skip-guide"]');
        this.cancel = this.dialog.querySelector('[data-rush-action="cancel"]');
        this.dialog.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button?.dataset.rushChoice) this.select(button.dataset.rushChoice);
            else if (button?.dataset.rushAction) onAction(button.dataset.rushAction);
        });
        this.dialog.addEventListener('keydown', (event) => { if (this.dialog.open) event.stopPropagation(); });
        this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); onAction('cancel'); });
    }

    select(difficulty) {
        this.difficulty = difficulty;
        this.choices.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.rushChoice === difficulty)));
    }

    show(view, { difficulty = 'standard', guide = true } = {}) {
        this.view = view;
        const entry = view === 'entry';
        this.dialog.dataset.rushView = view;
        this.dialog.querySelector('h2').textContent = entry ? 'سفارش آخر' : 'راهنمای سفارش آخر';
        this.briefing.hidden = entry && !guide;
        this.levels.hidden = !entry;
        this.skip.hidden = !entry || !guide;
        this.cancel.hidden = !entry;
        this.confirm.textContent = entry && !guide ? 'شروع شیفت' : 'متوجه شدم';
        if (entry) this.select(difficulty);
        if (!this.dialog.open) this.dialog.showModal();
        (entry ? this.choices.find((button) => button.dataset.rushChoice === difficulty) : this.confirm)?.focus();
    }

    close() {
        if (this.dialog.open) this.dialog.close();
        this.view = null;
        delete this.dialog.dataset.rushView;
    }

    update(model, notice) {
        const nodes = this.nodes;
        text(nodes.level, `${model.rules.label} · ${rushDigits.format(model.rules.level)} از ۱۰`);
        text(nodes.time, clock(model.remaining));
        text(nodes.served, `${rushDigits.format(model.delivered)} / ${rushDigits.format(model.rules.quota)}`);
        text(nodes.score, rushDigits.format(model.score));
        text(nodes.combo, rushDigits.format(model.combo));
        const vip = model.vipServed ? 'سفارش ویژه تحویل شد'
            : model.vipIssued ? 'اوزودی · سفارش ویژه'
            : model.elapsed >= VIP_AT ? 'اوزودی منتظر برگه است'
            : model.elapsed >= 65 ? `مهمان ویژه تا ${rushDigits.format(Math.ceil(VIP_AT - model.elapsed))} ثانیه`
            : `ظرفیت صف ${rushDigits.format(model.rules.capacity)}`;
        text(nodes.vip, vip);
        text(nodes.notice, notice);
        this.hud.dataset.urgent = String(model.remaining <= 15);
        const focus = rushObjective(model);
        text(nodes.goal, focus.label);
        const urgent = model.orders.reduce((soonest, order) => order.due - model.elapsed <= 6
            && (!soonest || order.due < soonest.due) ? order : soonest, null);
        nodes.urgent.hidden = !urgent;
        if (urgent) text(nodes.urgent, `! فوری · #${rushDigits.format(urgent.id)} · میز ${rushDigits.format(urgent.table)} · ${rushDigits.format(Math.max(0, Math.ceil(urgent.due - model.elapsed)))} ث`);
        const carrying = model.carriedOrder;
        nodes.tray.hidden = !carrying;
        if (carrying) {
            text(nodes.destination, `${RECIPES[carrying.recipe].name} · میز ${rushDigits.format(carrying.table)}`);
            const value = 1 - model.tray.risk;
            nodes.balance.value = value;
            nodes.tray.dataset.risk = value < .34 ? 'high' : value < .68 ? 'medium' : 'low';
            text(nodes.risk, value < .34 ? '! سینی در خطر · آهسته‌تر' : value < .68 ? '△ تعادل سینی کم شده' : '✓ سینی متعادل');
        }
        this.updateTickets(model);
        const spot = model.status === 'running' && !this.dialog.open ? model.nearby() : null;
        nodes.prompt.hidden = !spot;
        if (!spot) {
            setTouchInteractionLabel(this.touchLabel);
            return;
        }
        const station = spot.kind === 'station' ? model.stationOrder(spot.id) : null;
        const label = station?.state === 'ready' ? 'برداشتن سینی' : station ? 'در حال آماده‌سازی' : TARGETS[spot.id];
        const action = spot.kind === 'tickets' ? 'برداشتن سفارش'
            : spot.kind === 'table' ? 'تحویل سفارش'
                : station?.state === 'ready' ? 'برداشتن سینی' : 'آماده‌سازی';
        setTouchInteractionLabel(this.touchLabel, action);
        text(nodes.prompt, `تعامل · ${label}`);
    }

    updateTickets(model) {
        const active = new Set(model.orders.map((order) => order.id));
        for (const [id, entry] of this.tickets) {
            if (!active.has(id)) { entry.card.remove(); this.tickets.delete(id); }
        }
        this.empty.hidden = model.orders.length > 0;
        for (const order of model.orders) {
            const recipe = RECIPES[order.recipe];
            let entry = this.tickets.get(order.id);
            if (!entry) {
                const card = document.createElement('article');
                card.className = 'rush-ticket';
                card.innerHTML = '<span data-ticket-icon aria-hidden="true"></span><strong></strong><span data-ticket-table></span><time dir="ltr"></time><small></small><i aria-hidden="true"></i>';
                card.dataset.rushTicket = String(order.id);
                const icon = card.querySelector('[data-ticket-icon]');
                icon.textContent = recipe.icon;
                icon.style.color = recipe.color;
                card.querySelector('strong').textContent = `#${rushDigits.format(order.id)} · ${recipe.name}`;
                card.querySelector('[data-ticket-table]').textContent = order.vip ? 'میز ۲ · VIP' : `میز ${rushDigits.format(order.table)}`;
                entry = { card, time: card.querySelector('time'), state: card.querySelector('small') };
                this.tickets.set(order.id, entry);
                this.nodes.tickets.append(card);
            }
            const remaining = Math.max(0, order.due - model.elapsed);
            entry.card.dataset.state = order.state;
            entry.card.dataset.urgent = String(remaining <= 6);
            entry.card.style.setProperty('--rush-patience', String(Math.min(1, remaining / (order.vip ? 30 : model.rules.patience))));
            text(entry.time, `${rushDigits.format(Math.ceil(remaining))} ث`);
            text(entry.state, STATES[order.state]);
        }
    }

    dispose() {
        setTouchInteractionLabel(this.touchLabel);
        this.close();
        this.hud.remove();
        this.dialog.remove();
    }
}
