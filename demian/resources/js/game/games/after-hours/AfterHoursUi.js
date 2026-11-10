import setTouchInteractionLabel from '../../input/TouchInteractionLabel.js';
import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';
import { CIRCUITS, SHIFT_RULES, circuitAt } from './AfterHoursMap.js';

const digits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const doubleDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false, minimumIntegerDigits: 2 });

export function shiftTime(seconds) {
    const time = Math.max(0, Math.ceil(seconds));
    return `${doubleDigits.format(Math.floor(time / 60))}:${doubleDigits.format(time % 60)}`;
}

const DANGER = Object.freeze({
    patrol: 'سایه در گشت',
    investigate: '△ سایه دنبال صداست',
    chase: '! در تعقیب · مسیرت را عوض کن',
});

const TOUCH_ACTIONS = {
    panel: 'بازکردن تابلو',
    card: 'برداشتن کارت',
    locker: 'بازکردن محفظه',
    exit: 'بازکردن خروجی',
};

const BRIEFING = `
    <p>دو کارت شیفت را پیدا کن، برق خروجی را وصل کن و پیش از پایان وقت بیرون برو.</p>
    <p>در گوشی، نمای افقی دید بیشتری از مسیر فرار می‌دهد.</p>
    <p>دو مدار هم‌زمان روشن می‌مانند. دویدن و باز کردن محفظهٔ فلزی صدا ایجاد می‌کند و سایه را خبر می‌کند.</p>
    <div class="shift-guide__controls">
        <span class="shift-guide__keyboard">حرکت <kbd>WASD / ↑↓←→</kbd> · دویدن <kbd>Shift</kbd> · تعامل <kbd>E</kbd></span>
        <span class="shift-guide__touch">جوی‌استیک برای حرکت · دکمهٔ «دویدن» · دکمهٔ «تعامل» کنار هر علامت</span>
        <span>دستهٔ بازی · استیک چپ برای حرکت، دکمهٔ دویدن و تعامل طبق تنظیمات دمیان</span>
    </div>
`;

function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
}

export default class AfterHoursUi {
    constructor(root, onAction) {
        this.root = root;
        this.touchLabel = root.querySelector('[data-touch-interact-label]');
        this.onAction = onAction;
        this.hud = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.hud.className = 'shift-hud';
        this.hud.setAttribute('aria-label', 'وضعیت خاموشی کافه');
        this.hud.innerHTML = `
            <div class="game-readout__rail">
                <div class="game-readout__stats">
                <div class="shift-hud__meter">
                    <span>زمان مانده</span><time data-shift-time dir="ltr"></time>
                </div>
                <div class="shift-hud__meter">
                    <span>کارت شیفت</span><b data-shift-cards dir="ltr"></b>
                </div>
                </div>
                <div class="game-readout__state">
                    <strong data-shift-danger role="status"></strong>
                    <span data-shift-goal></span>
                </div>
                <details class="game-readout__details">
                    <summary>مدارها و بی‌سیم</summary>
                    <div class="game-readout__body">
                        <div class="game-readout__meta">
                            <span data-shift-level></span>
                            <span data-shift-zone></span>
                            <span data-shift-relic hidden>◇ یادگار همراهت است</span>
                        </div>
                        <div class="shift-hud__circuits" aria-label="مدارهای برق">
                    ${CIRCUITS.map((circuit) => `<div data-shift-circuit="${circuit.id}">
                        <i aria-hidden="true"></i><b>${circuit.label}</b><small></small>
                    </div>`).join('')}
                        </div>
                        <div class="shift-hud__radio">
                            <strong>نگار / بی‌سیم</strong><span data-shift-radio></span>
                        </div>
                    </div>
                </details>
            </div>
            <div class="shift-hud__prompt" data-shift-prompt hidden></div>
        `;
        root.querySelector('[data-game-hud-host]').append(this.hud);
        this.nodes = Object.fromEntries(['level', 'time', 'cards', 'zone', 'danger', 'goal', 'relic', 'radio', 'prompt']
            .map((id) => [id, this.hud.querySelector(`[data-shift-${id}]`)]));
        this.circuitNodes = [...this.hud.querySelectorAll('[data-shift-circuit]')];

        this.dialog = assignUiLayer(document.createElement('dialog'), UI_LAYER.LOCAL_BASE);
        this.dialog.className = 'shift-dialog';
        this.dialog.dataset.gameDialog = 'after-hours';
        this.dialog.setAttribute('aria-labelledby', 'after-hours-dialog-title');
        this.dialog.innerHTML = `
            <div class="shift-dialog__header">
                <span class="shift-dialog__badge" aria-hidden="true">ϟ</span>
                <div><p lang="en" dir="ltr">DEMIAN / NIGHT SHIFT</p><h2 id="after-hours-dialog-title">خاموشی کافه</h2></div>
            </div>
            <div class="shift-guide" data-shift-briefing>${BRIEFING}</div>
            <fieldset class="shift-levels" data-shift-levels>
                <legend>درجهٔ سختی</legend>
                ${Object.entries(SHIFT_RULES).map(([id, rules]) => `<button type="button" data-shift-choice="${id}" aria-pressed="false">
                    <span><strong>${rules.label}</strong><b>${digits.format(rules.level)} از ۱۰</b></span>
                    <small>${digits.format(rules.duration / 60)} دقیقه · ${id === 'hard' ? 'سایه سریع‌تر صدا را دنبال می‌کند' : 'فرصت بیشتر برای تغییر مسیر'}</small>
                </button>`).join('')}
            </fieldset>
            <div class="shift-power" data-shift-power hidden>
                <p>دو مدار روشن می‌مانند. خاموش کردن یک مدار، بخش متناظر کافه را بی‌برق می‌کند و مدار قبلی را روشن می‌کند.</p>
                ${CIRCUITS.map((circuit) => `<button type="button" data-shift-switch="${circuit.id}">
                    <span aria-hidden="true">ϟ</span><strong>مدار ${circuit.label}</strong><small></small>
                </button>`).join('')}
            </div>
            <div class="shift-dialog__actions">
                <button type="button" data-shift-action="confirm">متوجه شدم</button>
                <button type="button" data-shift-action="skip-guide">دیگر نمایش نده</button>
                <button type="button" data-shift-action="cancel" class="shift-dialog__cancel">بازگشت</button>
            </div>
        `;
        root.querySelector('[data-game-overlay-host]').append(this.dialog);
        this.parts = Object.fromEntries(['briefing', 'levels', 'power']
            .map((id) => [id, this.dialog.querySelector(`[data-shift-${id}]`)]));
        this.buttons = Object.fromEntries(['confirm', 'skip-guide', 'cancel']
            .map((id) => [id, this.dialog.querySelector(`[data-shift-action="${id}"]`)]));
        this.choices = [...this.dialog.querySelectorAll('[data-shift-choice]')];
        this.switches = [...this.dialog.querySelectorAll('[data-shift-switch]')];
        this.dialog.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            const { shiftChoice, shiftSwitch, shiftAction } = button.dataset;
            if (shiftChoice) this.selectDifficulty(shiftChoice);
            else this.onAction(shiftSwitch ? 'power' : shiftAction, shiftSwitch);
        });
        this.dialog.addEventListener('keydown', (event) => {
            if (this.dialog.open) event.stopPropagation();
        });
        this.dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            this.onAction('cancel');
        });
    }

    selectDifficulty(difficulty) {
        this.difficulty = difficulty;
        for (const button of this.choices) {
            button.setAttribute('aria-pressed', String(button.dataset.shiftChoice === difficulty));
        }
    }

    show(view, { guide = true, difficulty = 'standard', darkCircuit } = {}) {
        this.view = view;
        this.dialog.dataset.shiftView = view;
        this.parts.briefing.hidden = !guide || view === 'power';
        this.parts.levels.hidden = view !== 'entry';
        this.parts.power.hidden = view !== 'power';
        this.buttons.confirm.hidden = view === 'power';
        this.buttons['skip-guide'].hidden = !guide || view !== 'entry';
        this.buttons.cancel.hidden = view === 'help';
        const title = view === 'power' ? 'تابلو برق اضطراری' : view === 'help' ? 'راهنمای خاموشی کافه' : 'خاموشی کافه';
        this.dialog.querySelector('h2').textContent = title;
        this.buttons.confirm.textContent = view === 'entry' && !guide ? 'شروع شیفت' : 'متوجه شدم';
        if (view === 'entry') this.selectDifficulty(difficulty);
        if (view === 'power') {
            for (const button of this.switches) {
                button.disabled = button.dataset.shiftSwitch === darkCircuit;
                button.querySelector('small').textContent = button.disabled ? 'اکنون خاموش' : 'خاموش کردن';
            }
        }
        if (!this.dialog.open) this.dialog.showModal();
        const focus = view === 'entry' ? this.choices.find((button) => button.dataset.shiftChoice === difficulty)
            : view === 'power' ? this.switches.find((button) => !button.disabled) : this.buttons.confirm;
        focus?.focus();
    }

    close() {
        if (this.dialog.open) this.dialog.close();
        this.view = null;
        delete this.dialog.dataset.shiftView;
    }

    update(model, radio) {
        const nodes = this.nodes;
        this.hud.dataset.alert = model.shadow.mode;
        this.hud.dataset.urgent = String(model.remaining <= 60);
        setText(nodes.level, `${model.rules.label} · ${digits.format(model.rules.level)} از ۱۰`);
        setText(nodes.time, shiftTime(model.remaining));
        setText(nodes.cards, `${digits.format(model.cardCount)} / ۲`);
        const zone = circuitAt(model.player.position);
        const dark = CIRCUITS.find((circuit) => circuit.id === model.darkCircuit);
        setText(nodes.zone, `موقعیت: ${CIRCUITS.find((circuit) => circuit.id === zone).label}`);
        setText(nodes.danger, DANGER[model.shadow.mode]);
        setText(nodes.goal, model.exitReady ? 'به درِ خروج برو'
            : dark?.id === 'exit' ? 'تابلو برق · مدار خروجی را روشن کن' : 'کارت‌های شیفت را پیدا کن');
        setText(nodes.radio, radio);
        nodes.relic.hidden = !model.relic;
        for (const node of this.circuitNodes) {
            const powered = node.dataset.shiftCircuit !== model.darkCircuit;
            node.dataset.powered = String(powered);
            setText(node.querySelector('small'), `${powered ? '✓ روشن' : '× خاموش'}${node.dataset.shiftCircuit === zone ? ' · اینجا' : ''}`);
        }
        const target = model.status === 'running' && !this.dialog.open ? model.nearby() : null;
        setTouchInteractionLabel(this.touchLabel, TOUCH_ACTIONS[target?.kind]);
        nodes.prompt.hidden = !target;
        if (target) setText(nodes.prompt, `تعامل · ${target.label}`);
    }

    dispose() {
        setTouchInteractionLabel(this.touchLabel);
        this.close();
        this.dialog.remove();
        this.hud.remove();
    }
}
