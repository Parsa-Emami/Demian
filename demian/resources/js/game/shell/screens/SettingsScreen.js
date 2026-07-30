import BaseScreen from './BaseScreen';

export default class SettingsScreen extends BaseScreen {
    constructor({ settings, ...options }) {
        super({ ...options, layer: 'modal' });
        this.settings = settings;
        this.form = this.element.querySelector('[data-settings-form]');
    }

    async beforeOpen() {
        const state = this.settings.snapshot();
        Object.entries(state).forEach(([key, value]) => {
            const field = this.form?.elements?.namedItem(key);
            if (!field) return;
            if (field.type === 'checkbox') field.checked = Boolean(value);
            else field.value = String(value);
        });
    }

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
