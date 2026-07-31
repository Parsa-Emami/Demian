import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
    })[character]);
}

export default class QuestPanel {
    constructor({ host } = {}) {
        this.host = host;
        this.element = null;
    }

    mount() {
        if (this.element || !this.host) return;
        const element = document.createElement('aside');
        element.className = 'role-play-side-panel role-play-quest-panel';
        element.dir = 'rtl';
        element.hidden = true;
        assignUiLayer(element, UI_LAYER.LOCAL_RAISED);
        this.host.appendChild(element);
        this.element = element;
    }

    show(quests = []) {
        if (!this.element) this.mount();
        if (!this.element) return;

        this.element.hidden = false;
        this.element.innerHTML = `
            <header><small>QUEST JOURNAL</small><strong>مأموریت‌ها</strong></header>
            ${quests.length ? quests.map((quest) => `
                <article>
                    <h3>${escapeHtml(quest.title)}</h3>
                    <p>${escapeHtml(quest.description)}</p>
                    <ul>${quest.objectives.map((objective) => `
                        <li data-complete="${objective.complete}" data-locked="${!objective.unlocked}">
                            <span>${objective.complete ? '✓' : objective.unlocked ? '○' : '🔒'}</span>
                            ${escapeHtml(objective.title)}
                            <b>${Math.floor(objective.progress)}/${objective.target}</b>
                        </li>
                    `).join('')}</ul>
                </article>
            `).join('') : '<p class="is-empty">مأموریت فعالی نداری.</p>'}
        `;
    }

    hide() { if (this.element) this.element.hidden = true; }
    toggle(quests = []) { this.element?.hidden === false ? this.hide() : this.show(quests); }
    dispose() { this.element?.remove(); this.element = null; }
}
