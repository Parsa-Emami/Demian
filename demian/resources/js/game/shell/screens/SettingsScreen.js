import BaseScreen from './BaseScreen';
import { applyTouchControlLayout, readTouchControls } from '../../input/TouchControlPreferences.js';
import ControlBindingPanel from '../../input/ControlBindingPanel.js';
import PlayerIdentityPanel from '../../ui/PlayerIdentityPanel.js';

export default class SettingsScreen extends BaseScreen {
    constructor({ settings, input, leaderboards, ...options }) {
        super({ ...options, layer: 'modal' });
        this.settings = settings;
        this.form = this.element.querySelector('[data-settings-form]');
        this.touchPreview = this.element.querySelector('[data-touch-preview]');
        this.onTouchPreview = () => this.refreshTouchPreview();
        this.form?.addEventListener('input', this.onTouchPreview);
        this.form?.addEventListener('change', this.onTouchPreview);
        this.controls = new ControlBindingPanel(this.element.querySelector('[data-control-bindings]'), input);
        this.identityPanel = new PlayerIdentityPanel({
            root: this.element.querySelector('[data-player-identity-panel]'), leaderboards,
        });
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
        this.refreshTouchPreview();
        // Network-dependent account status must not delay opening settings.
        void this.identityPanel.refresh();
    }

    refreshTouchPreview() {
        if (!this.touchPreview) return;
        const controls = readTouchControls(new FormData(this.form));
        applyTouchControlLayout(this.touchPreview, controls);
        this.touchPreview.dataset.touchVisibility = controls.touchVisibility;
        for (const range of this.form.querySelectorAll('[data-touch-settings] input[type="range"]')) {
            range.nextElementSibling.textContent = range.value;
        }
    }

    async beforeClose() { this.controls.cancel(); }

    dispose() {
        this.form?.removeEventListener('input', this.onTouchPreview);
        this.form?.removeEventListener('change', this.onTouchPreview);
        this.controls.dispose();
        this.identityPanel.dispose();
        super.dispose();
    }

    readForm() {
        if (!this.form) return {};
        const data = new FormData(this.form);
        return {
            ...readTouchControls(data),
            motion: data.get('motion'),
            quality: data.get('quality'),
            frameRate: data.get('frameRate'),
            interfaceDensity: data.get('interfaceDensity'),
            hudScale: data.get('hudScale'),
            hudContrast: data.get('hudContrast'),
            hudVisible: data.get('hudVisible') === 'on',
            hintsVisible: data.get('hintsVisible') === 'on',
            soundEnabled: data.get('soundEnabled') === 'on',
            musicEnabled: data.get('musicEnabled') === 'on',
        };
    }
}
