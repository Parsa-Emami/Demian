import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';
import DialoguePanel from './DialoguePanel.js';
import QuestPanel from './QuestPanel.js';
import InventoryPanel from './InventoryPanel.js';

export default class RolePlayHud {
    constructor({ root, animation, itemRegistry, onPause, onChoice, onDialogueClose, onEquip } = {}) {
        this.root = root;
        this.animation = animation;
        this.itemRegistry = itemRegistry;
        this.onPause = onPause;
        this.onChoice = onChoice;
        this.onDialogueClose = onDialogueClose;
        this.onEquip = onEquip;
        this.element = null;
        this.dialogue = null;
        this.quests = null;
        this.inventory = null;
        this.bannerTimer = null;
        this.lastSnapshot = null;
        this.onClick = this.onClick.bind(this);
    }

    mount() {
        const host = this.root?.querySelector('[data-game-hud-host]');
        const overlayHost = this.root?.querySelector('[data-game-overlay-host]') ?? host;
        if (!host || !overlayHost || this.element) return;

        const element = document.createElement('section');
        element.className = 'role-play-hud';
        element.dir = 'rtl';
        assignUiLayer(element, UI_LAYER.LOCAL_BASE);
        element.innerHTML = `
            <header class="role-play-hud__top">
                <div class="role-play-hud__brand"><span>◇</span><div><small>DEMIAN ROLE PLAY</small><strong>داستان تو</strong></div></div>
                <div class="role-play-hud__stats" dir="ltr">
                    <span><small>TIME</small><b data-rp-time>08:30</b></span>
                    <span><small>COINS</small><b data-rp-coins>0</b></span>
                    <span><small>QUESTS</small><b data-rp-quest-count>0</b></span>
                    <span><small>REL</small><b data-rp-rel>NEUTRAL</b></span>
                </div>
                <div class="role-play-hud__buttons">
                    <button type="button" data-rp-panel="quests">ماموریت</button>
                    <button type="button" data-rp-panel="inventory">کوله</button>
                    <button type="button" data-rp-pause>Ⅱ</button>
                </div>
            </header>
            <aside class="role-play-hud__objective">
                <small>ACTIVE STORY</small><strong data-rp-objective>با اعضای کافه آشنا شو.</strong><p data-rp-status>آماده‌ی ساختن داستان تو</p>
            </aside>
            <div class="role-play-hud__banner" data-rp-banner></div>
            <footer class="role-play-hud__footer" dir="ltr">
                <span><b>WASD</b> MOVE</span><span><b>SHIFT</b> RUN</span><span><b>ENTER</b> INTERACT</span><span><b>I</b> INVENTORY</span><span><b>J</b> QUESTS</span>
            </footer>
            <div data-control-surface="role-play" class="role-play-touch-actions" dir="ltr">
                <button type="button" data-input-press="interact" class="is-primary">TALK / USE</button>
                <button type="button" data-input-press="toggleInventory">BAG</button>
                <button type="button" data-input-press="toggleQuests">QUEST</button>
                <button type="button" data-input-hold="run">RUN</button>
            </div>
        `;
        host.appendChild(element);
        element.addEventListener('click', this.onClick);
        this.element = element;
        this.refs = {
            time: element.querySelector('[data-rp-time]'),
            coins: element.querySelector('[data-rp-coins]'),
            count: element.querySelector('[data-rp-quest-count]'),
            rel: element.querySelector('[data-rp-rel]'),
            objective: element.querySelector('[data-rp-objective]'),
            status: element.querySelector('[data-rp-status]'),
            banner: element.querySelector('[data-rp-banner]'),
        };

        this.dialogue = new DialoguePanel({ host: overlayHost, onChoice: this.onChoice, onClose: this.onDialogueClose });
        this.quests = new QuestPanel({ host: overlayHost });
        this.inventory = new InventoryPanel({ host: overlayHost, registry: this.itemRegistry, onEquip: this.onEquip });
        this.dialogue.mount();
        this.quests.mount();
        this.inventory.mount();
        this.animation?.reveal(element, { duration: 320 });
    }

    onClick(event) {
        if (event.target.closest('[data-rp-pause]')) this.onPause?.();
        const panel = event.target.closest('[data-rp-panel]')?.dataset.rpPanel;
        if (panel === 'quests') this.toggleQuests();
        if (panel === 'inventory') this.toggleInventory();
    }

    update(snapshot) {
        if (!this.element) return;
        this.lastSnapshot = snapshot;
        this.refs.time.textContent = snapshot.session.timeLabel;
        this.refs.coins.textContent = String(snapshot.inventory.coins);
        this.refs.count.textContent = String(snapshot.quests.active.length);
        this.refs.rel.textContent = (snapshot.relationships.ranks.tiam ?? 'neutral').toUpperCase();
        const quest = snapshot.quests.active[0];
        const objective = quest?.objectives.find((item) => item.unlocked && !item.complete);
        this.refs.objective.textContent = objective?.title ?? 'آزادانه کافه را کشف کن.';
        this.refs.status.textContent = snapshot.status ?? '—';
        if (snapshot.dialogue && !snapshot.dialogue.ended) this.dialogue.show(snapshot.dialogue);
        else this.dialogue.hide();
    }

    toggleQuests() {
        this.inventory.hide();
        this.quests.toggle(this.lastSnapshot?.quests.active ?? []);
    }

    toggleInventory() {
        this.quests.hide();
        this.inventory.toggle(this.lastSnapshot?.inventory ?? { stacks: [], coins: 0 }, this.lastSnapshot?.equipment ?? {});
    }

    closePanels() { this.quests.hide(); this.inventory.hide(); }

    announce(message, tone = 'info', duration = 1600) {
        clearTimeout(this.bannerTimer);
        this.refs.banner.textContent = message;
        this.refs.banner.dataset.tone = tone;
        this.refs.banner.classList.add('is-visible');
        this.bannerTimer = setTimeout(() => this.refs?.banner?.classList.remove('is-visible'), duration);
    }

    setPaused(value) { this.element?.classList.toggle('is-paused', Boolean(value)); }

    dispose() {
        clearTimeout(this.bannerTimer);
        this.element?.removeEventListener('click', this.onClick);
        this.dialogue?.dispose();
        this.quests?.dispose();
        this.inventory?.dispose();
        this.element?.remove();
        this.element = null;
    }
}
