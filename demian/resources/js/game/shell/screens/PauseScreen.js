import BaseScreen from './BaseScreen';

export default class PauseScreen extends BaseScreen {
    constructor(options) {
        super({ ...options, layer: 'modal' });
        this.title = this.element.querySelector('[data-pause-game-title]');
        this.guide = this.element.querySelector('[data-shell-action="game-guide"]');
    }

    async beforeOpen(payload) {
        if (this.title) this.title.textContent = payload.title ?? 'DEMIAN GAME';
        if (this.guide) this.guide.hidden = !payload.hasGuide;
    }
}
