import BaseScreen from './BaseScreen';
import ControlBindingPanel from '../../input/ControlBindingPanel.js';

export default class SettingsScreen extends BaseScreen {
    constructor({ settings, input, ...options }) {
        super({ ...options, layer: 'modal' });
        this.settings = settings;
        this.form = this.element.querySelector('[data-settings-form]');
        this.controls = new ControlBindingPanel(this.element.querySelector('[data-control-bindings]'), input);
    }

    async beforeOpen() {
        this.controls.cancel();
        const state = this.settings.snapshot();
        Object.entries(state).forEach(([key, value]) => {
            const field = this.form?.elements?.namedItem(key);
            if (!field) return;
            if (field.type === 'checkbox') field.checked = Boolean(value);
            else field.value = String(value);
        });
    }

    async beforeClose() { this.controls.cancel(); }

    dispose() { this.controls.dispose(); super.dispose(); }

    readForm() {
        if (!this.form) return {};
        const data = new FormData(this.form);
        return {
            motion: data.get('motion'),
            quality: data.get('quality'),
            interfaceDensity: data.get('interfaceDensity'),
            hudVisible: data.get('hudVisible') === 'on',
            hintsVisible: data.get('hintsVisible') === 'on',
            soundEnabled: data.get('soundEnabled') === 'on',
            musicEnabled: data.get('musicEnabled') === 'on',
        };
    }
}
