import { builtinCharacterPreviewUrl } from '../../characters/CharacterVisualContract.js';
import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';
import { CRITTERS, CRITTER_RULES, TABLE_FIELDS, cluesFor, tableLabel } from './CafeCrittersData.js';
import { TABLE_SCENE, guestDrawing, guestIcon, shelfStamps, tableIcon, tableObject } from './CafeCrittersArt.js';

export const critterDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const paddedDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false, minimumIntegerDigits: 2 });
const number = (value) => critterDigits.format(value);
const BRIEFING = `
    <p>نگار دفترچه‌ای کنار پنجره پیدا کرده است. نوشتهٔ دفترچه و سرنخ پیشی را بخوان، نور و خوراکی و دکور میز را انتخاب کن و مهمان را دعوت کن.</p>
    <p>بعد از دو چیدمان اشتباهِ متفاوت، یک سرنخ دقیق‌تر می‌گیری. هر کشف یک صفحه و یک یادگاری به دفترچه اضافه می‌کند.</p>
    <div class="shift-guide__controls">
        <span class="shift-guide__keyboard">جابجایی با <kbd>Tab</kbd> و انتخاب با <kbd>Enter</kbd> یا <kbd>Space</kbd></span>
        <span class="shift-guide__touch">روی گزینه‌ها و دکمهٔ «دعوت مهمان» بزن.</span>
    </div>
`;

function pishiArt() {
    return `<svg class="critters-pishi" viewBox="36 141 49 71" aria-hidden="true" focusable="false">
        <defs><clipPath id="critters-pishi-crop"><path d="M36 213V143H67L73 149L79 145L82 151V156L85 164L84 173L81 179L80 191L78 198L80 204L78 213Z"/></clipPath></defs>
        <image href="${builtinCharacterPreviewUrl('darya')}" width="224" height="224" clip-path="url(#critters-pishi-crop)"/>
    </svg>`;
}

function choicesMarkup() {
    return TABLE_FIELDS.map(({ id, label, options }, index) => `
        <fieldset class="critters-field" data-critters-field="${id}">
            <legend><b aria-hidden="true">${paddedDigits.format(index + 1)}</b> ${label}</legend>
            <div class="critters-field__options">
                ${Object.entries(options).map(([value, text]) => `
                    <button type="button" data-critters-option="${value}" data-critters-category="${id}" aria-pressed="false">
                        ${tableIcon(value)}<span>${text}</span>
                    </button>`).join('')}
            </div>
        </fieldset>`).join('');
}

function albumPages(discovered) {
    return CRITTERS.map((guest, index) => {
        const open = discovered.has(guest.id);
        const details = open ? `<strong>${guest.name}</strong><span>${guest.title}</span><p>${guest.behavior}</p><small>یادگاری · ${guest.souvenir}</small>`
            : '<strong>صفحهٔ سفید</strong><span>در انتظار دیدار</span>';
        return `<article class="critters-album-page" data-critter-unlocked="${open}">
            <div class="critters-album-page__art">${open ? guestIcon(guest.id) : '<span aria-hidden="true">✦</span>'}</div>
            <div><span class="critters-kicker">صفحهٔ ${paddedDigits.format(index + 1)}</span>${details}</div>
        </article>`;
    }).join('');
}

function feedbackFor(model) {
    if (model.feedback?.type === 'miss') {
        return `مهمان هنوز نیامده. ${number(model.feedback.matches)} از ۳ انتخاب با سرنخ‌ها جور است.`;
    }
    if (model.feedback?.type === 'repeat') return 'این چیدمان را امتحان کرده‌ای. یکی از انتخاب‌ها را عوض کن.';
    if (model.status === 'visiting') return model.feedback.first ? 'یک صفحهٔ تازه و یک یادگاری ثبت شد.' : 'دیدار دوباره در این نوبت ثبت شد.';
    return 'برای دعوت، هر سه قسمت میز را بچین.';
}

export default class CafeCrittersUi {
    constructor(root, actions) {
        this.hud = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.hud.className = 'critters-hud';
        this.hud.setAttribute('aria-label', 'مهمان‌های ریز کافه');
        this.hud.innerHTML = `
            <div class="critters-board" data-gamepad-scope>
                <header class="critters-header">
                    <div class="critters-header__title">
                        <svg class="critters-negar" viewBox="51 47 110 103" aria-hidden="true" focusable="false">
                            <image href="${builtinCharacterPreviewUrl('negar')}" width="224" height="224"/>
                        </svg>
                        <div><span class="critters-kicker" lang="en" dir="ltr">DEMIAN / FIELD NOTES</span><h2>مهمان‌های ریز کافه</h2></div>
                    </div>
                    <div class="critters-header__stats">
                        <div><span>زمان نوبت</span><time data-critters-time dir="ltr"></time></div>
                        <div><span>این نوبت</span><b data-critters-turn dir="ltr"></b></div>
                        <button type="button" data-critters-action="album"><span>دفترچهٔ مهمان‌ها</span><b data-critters-count dir="ltr"></b></button>
                    </div>
                </header>
                <div class="critters-grid">
                    <section class="critters-scene" data-critters-light="none" aria-label="میز کنار پنجره">
                        ${TABLE_SCENE}
                        <div class="critters-scene__caption"><span>میز کنار پنجره</span><b data-critters-mode></b></div>
                    </section>
                    <section class="critters-page" aria-labelledby="critters-page-title">
                        <div class="critters-page__top">
                            <div class="critters-page__portrait" data-critters-portrait></div>
                            <div><span class="critters-kicker" data-critters-page></span><h3 id="critters-page-title" data-critters-guest></h3>
                                <p data-critters-guest-title></p></div>
                        </div>
                        <div class="critters-page__clues" data-critters-clues>
                            <div class="critters-note"><strong>یادداشت نگار</strong><p data-critters-journal></p></div>
                            <div class="critters-note critters-note--pishi">
                                ${pishiArt()}
                                <div><strong>سرنخ پیشی</strong><p data-critters-pishi></p><div class="critters-clue-art" data-critters-clue-art></div></div>
                            </div>
                            <p class="critters-hint" data-critters-hint aria-live="polite" hidden></p>
                        </div>
                        <div class="critters-page__reward" data-critters-reward hidden>
                            <p data-critters-behavior></p><strong data-critters-souvenir></strong>
                        </div>
                    </section>
                    <section class="critters-workbench" aria-labelledby="critters-workbench-title">
                        <div class="critters-workbench__head"><h3 id="critters-workbench-title">چیدن میز</h3><span data-critters-picks></span></div>
                        <div class="critters-fields" data-critters-choices>${choicesMarkup()}</div>
                        <div class="critters-workbench__foot">
                            <p data-critters-feedback role="status" aria-live="polite"></p>
                            <button class="critters-primary" type="button" data-critters-action="invite">دعوت مهمان</button>
                            <button class="critters-primary" type="button" data-critters-action="next" hidden>مهمان بعدی</button>
                        </div>
                    </section>
                    <section class="critters-index" aria-labelledby="critters-index-title">
                        <div><h3 id="critters-index-title">صفحه‌های دفترچه</h3><span>یادگاری‌های کشف‌شده روی قفسه می‌نشینند.</span></div>
                        <ol data-critters-index></ol>
                    </section>
                </div>
            </div>`;
        root.querySelector('[data-game-hud-host]').append(this.hud);
        this.board = this.hud.querySelector('.critters-board');
        this.scene = this.hud.querySelector('.critters-scene');
        this.controls = [...this.hud.querySelectorAll('[data-critters-option]')];
        this.nodes = Object.fromEntries([
            'time', 'turn', 'count', 'mode', 'portrait', 'page', 'guest', 'guest-title', 'clues', 'journal', 'pishi', 'clue-art',
            'hint', 'reward', 'behavior', 'souvenir', 'picks', 'choices', 'feedback', 'index',
            'table-food', 'table-decor', 'table-guest', 'table-shelf',
        ].map((id) => [id, this.hud.querySelector(`[data-critters-${id}]`)]));
        this.buttons = Object.fromEntries(['invite', 'next', 'album'].map((id) => [id, this.hud.querySelector(`[data-critters-action="${id}"]`)]));
        this.hud.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button?.dataset.crittersOption) actions.choose(button.dataset.crittersCategory, button.dataset.crittersOption);
            else if (button?.dataset.crittersAction) actions.action(button.dataset.crittersAction);
        });

        this.dialog = assignUiLayer(document.createElement('dialog'), UI_LAYER.LOCAL_BASE);
        this.dialog.className = 'shift-dialog critters-dialog';
        this.dialog.dataset.gameDialog = 'cafe-critters';
        this.dialog.setAttribute('aria-labelledby', 'critters-dialog-title');
        this.dialog.innerHTML = `
            <div class="shift-dialog__header">
                <span class="shift-dialog__badge" aria-hidden="true">✦</span>
                <div><p lang="en" dir="ltr">DEMIAN / CAFÉ CRITTERS</p><h2 id="critters-dialog-title">مهمان‌های ریز کافه</h2></div>
            </div>
            <div class="shift-guide" data-critters-briefing>${BRIEFING}</div>
            <fieldset class="shift-levels" data-critters-levels>
                <legend>درجهٔ سختی</legend>
                ${Object.entries(CRITTER_RULES).map(([id, rule]) => `<button type="button" data-critters-choice="${id}" aria-pressed="false">
                    <span><strong>${rule.label}</strong><b>${number(rule.level)} از ۱۰</b></span>
                    <small>${number(rule.seconds / 60)} دقیقه · ${rule.clue}</small>
                </button>`).join('')}
            </fieldset>
            <div class="critters-album" data-critters-album hidden></div>
            <div class="shift-dialog__actions">
                <button type="button" data-shift-action="confirm" data-critters-dialog-action="confirm">متوجه شدم</button>
                <button type="button" data-critters-dialog-action="skip-guide">دیگر نمایش نده</button>
                <button type="button" data-critters-dialog-action="cancel" class="shift-dialog__cancel">بازگشت</button>
            </div>`;
        root.querySelector('[data-game-overlay-host]').append(this.dialog);
        this.dialogChoices = [...this.dialog.querySelectorAll('[data-critters-choice]')];
        this.briefing = this.dialog.querySelector('[data-critters-briefing]');
        this.levels = this.dialog.querySelector('[data-critters-levels]');
        this.album = this.dialog.querySelector('[data-critters-album]');
        this.confirm = this.dialog.querySelector('[data-critters-dialog-action="confirm"]');
        this.skip = this.dialog.querySelector('[data-critters-dialog-action="skip-guide"]');
        this.cancel = this.dialog.querySelector('[data-critters-dialog-action="cancel"]');
        this.dialog.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (button?.dataset.crittersChoice) this.selectDifficulty(button.dataset.crittersChoice);
            else if (button?.dataset.crittersDialogAction) actions.dialog(button.dataset.crittersDialogAction);
        });
        this.dialog.addEventListener('keydown', (event) => { if (this.dialog.open) event.stopPropagation(); });
        this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); actions.dialog('cancel'); });
    }

    selectDifficulty(difficulty) {
        this.difficulty = difficulty;
        for (const button of this.dialogChoices) button.setAttribute('aria-pressed', String(button.dataset.crittersChoice === difficulty));
    }

    show(view, { difficulty = 'standard', guide = true, discovered = new Set() } = {}) {
        this.view = view;
        this.dialog.dataset.crittersView = view;
        const entry = view === 'entry';
        const album = view === 'album';
        this.dialog.querySelector('h2').textContent = album ? 'دفترچهٔ مهمان‌ها' : entry ? 'مهمان‌های ریز کافه' : 'راهنمای مهمان‌های ریز کافه';
        this.briefing.hidden = album || (entry && !guide);
        this.levels.hidden = !entry;
        this.skip.hidden = !entry || !guide;
        this.cancel.hidden = !entry;
        this.album.hidden = !album;
        this.confirm.textContent = album ? 'بستن دفترچه' : entry && !guide ? 'شروع نوبت' : 'متوجه شدم';
        if (album) this.album.innerHTML = albumPages(discovered);
        if (entry) this.selectDifficulty(difficulty);
        if (!this.dialog.open) this.dialog.showModal();
        (entry ? this.dialogChoices.find((button) => button.dataset.crittersChoice === difficulty) : this.confirm)?.focus();
    }

    close() {
        if (this.dialog.open) this.dialog.close();
        this.view = null;
    }

    focusChoice({ resetScroll = false } = {}) {
        if (resetScroll) this.board.scrollTop = 0;
        this.controls[0]?.focus({ preventScroll: true });
    }

    updateTime(seconds) {
        const value = Math.max(0, Math.ceil(seconds));
        if (value === this.shownTime) return;
        this.shownTime = value;
        this.nodes.time.textContent = `${paddedDigits.format(Math.floor(value / 60))}:${paddedDigits.format(value % 60)}`;
        this.hud.dataset.urgent = String(value <= 20);
    }

    update(model) {
        const { guest, rules, selection, status, album, hint } = model;
        const nodes = this.nodes;
        const visiting = status === 'visiting';
        const playing = status === 'playing';
        this.updateTime(model.remaining);
        nodes.turn.textContent = `${number(model.found)} / ${number(model.targets.length)}`;
        nodes.count.textContent = `${number(album.size)} / ${number(CRITTERS.length)}`;
        nodes.mode.textContent = `${rules.label} · ${number(rules.level)} از ۱۰`;
        nodes.feedback.textContent = feedbackFor(model);
        nodes.feedback.dataset.kind = model.feedback?.type ?? 'neutral';
        nodes.picks.textContent = visiting ? 'مهمان رسید' : `${number(Object.values(selection).filter(Boolean).length)} از ۳ انتخاب`;
        nodes.choices.hidden = visiting;
        this.buttons.invite.hidden = visiting;
        this.buttons.invite.disabled = !model.canInvite;
        this.buttons.next.hidden = !visiting;
        this.buttons.next.textContent = model.page + 1 === model.targets.length ? 'دیدن نتیجهٔ نوبت' : 'مهمان بعدی';
        this.buttons.album.disabled = !playing && !visiting;
        for (const control of this.controls) {
            const value = selection[control.dataset.crittersCategory];
            control.disabled = !playing;
            control.setAttribute('aria-pressed', String(control.dataset.crittersOption === value));
        }

        this.renderPage(guest, model.difficulty, visiting, hint);
        this.renderTable(selection, visiting ? guest.id : null);
        this.renderCollection(album);
    }

    renderPage(guest, difficulty, visiting, hint) {
        const nodes = this.nodes;
        const key = `${guest.id}/${difficulty}/${visiting}`;
        if (key !== this.currentPage) {
            this.currentPage = key;
            nodes.page.textContent = `صفحهٔ ${paddedDigits.format(CRITTERS.indexOf(guest) + 1)}`;
            nodes.guest.textContent = guest.name;
            nodes['guest-title'].textContent = guest.title;
            nodes.portrait.innerHTML = visiting ? guestIcon(guest.id) : '<span aria-hidden="true">✦</span>';
            const clues = cluesFor(guest, difficulty);
            nodes.journal.textContent = clues.journal;
            nodes.pishi.textContent = clues.pishi;
            nodes['clue-art'].innerHTML = clues.art.map(tableIcon).join('');
            nodes.clues.hidden = visiting;
            nodes.reward.hidden = !visiting;
            nodes.behavior.textContent = guest.behavior;
            nodes.souvenir.textContent = `یادگاری · ${guest.souvenir}`;
        }
        nodes.hint.hidden = !hint;
        const hintText = hint ? `سرنخ دقیق‌تر · ${TABLE_FIELDS.find((field) => field.id === hint.field).label} را روی «${tableLabel(hint.field, hint.value)}» بگذار.` : '';
        if (nodes.hint.textContent !== hintText) nodes.hint.textContent = hintText;
    }

    renderTable(selection, id) {
        this.scene.dataset.crittersLight = selection.light ?? 'none';
        const key = `${selection.food}/${selection.decor}/${id}`;
        if (key === this.currentTable) return;
        this.currentTable = key;
        this.nodes['table-food'].innerHTML = tableObject(selection.food);
        this.nodes['table-decor'].innerHTML = tableObject(selection.decor);
        this.nodes['table-guest'].innerHTML = id ? `<g class="critters-visit" data-critters-visitor="${id}">${guestDrawing(id)}</g>` : '';
    }

    renderCollection(album) {
        const key = [...album].join('/');
        if (key === this.currentAlbum) return;
        this.currentAlbum = key;
        this.nodes['table-shelf'].innerHTML = shelfStamps(album, CRITTERS);
        this.nodes.index.innerHTML = CRITTERS.map((guest, index) => {
            const found = album.has(guest.id);
            return `<li data-critters-found="${found}" aria-label="${found ? guest.name : 'صفحهٔ کشف‌نشده'}">
                ${found ? guestIcon(guest.id) : `<span>${number(index + 1)}</span>`}</li>`;
        }).join('');
    }

    dispose() { this.close(); this.hud.remove(); this.dialog.remove(); }
}
