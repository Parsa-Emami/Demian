export default class MobileGameUI {
    constructor({ root }) {
        this.root = root;
        this.stage = root.querySelector('.manager-stage');
        this.actionsToggle = root.querySelector('[data-mobile-actions-toggle]');
        this.actionsTray = root.querySelector('[data-mobile-actions-tray]');
        this.fullscreenButton = root.querySelector('[data-mobile-fullscreen]');
        this.orientationHint = root.querySelector('[data-orientation-hint]');
        this.isExpanded = false;

        this.onActionsToggle = this.onActionsToggle.bind(this);
        this.onActionPress = this.onActionPress.bind(this);
        this.onFullscreen = this.onFullscreen.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
    }

    boot() {
        const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.root.dataset.pointerMode = coarse ? 'coarse' : 'fine';

        this.actionsToggle?.addEventListener('click', this.onActionsToggle);
        this.actionsTray?.addEventListener('pointerdown', this.onActionPress);
        this.fullscreenButton?.addEventListener('click', this.onFullscreen);
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
        window.addEventListener('resize', this.onViewportChange, { passive: true });
        window.visualViewport?.addEventListener('resize', this.onViewportChange, { passive: true });

        this.stage?.addEventListener('contextmenu', (event) => event.preventDefault());
        this.onViewportChange();
        this.applyExpandedState();
    }

    onActionsToggle(event) {
        event.preventDefault();
        this.isExpanded = !this.isExpanded;
        navigator.vibrate?.(8);
        this.applyExpandedState();
    }

    onActionPress(event) {
        const button = event.target.closest('[data-input-press]');
        if (!button) {
            return;
        }

        window.setTimeout(() => {
            this.isExpanded = false;
            this.applyExpandedState();
        }, 140);
    }

    applyExpandedState() {
        this.root.dataset.mobileActions = this.isExpanded ? 'expanded' : 'collapsed';
        this.actionsToggle?.setAttribute('aria-expanded', String(this.isExpanded));
        this.actionsTray?.setAttribute('aria-hidden', String(!this.isExpanded));

        const label = this.actionsToggle?.querySelector('[data-mobile-actions-label]');
        if (label) {
            label.textContent = this.isExpanded ? 'بستن' : 'اکشن‌ها';
        }
    }

    async onFullscreen() {
        try {
            const fullscreenElement = document.fullscreenElement ?? document.webkitFullscreenElement;
            if (fullscreenElement) {
                const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
                await exit?.call(document);
            } else {
                const request = this.stage?.requestFullscreen ?? this.stage?.webkitRequestFullscreen;
                await request?.call(this.stage, { navigationUI: 'hide' });
            }
        } catch (error) {
            console.warn('Fullscreen mode is not available on this browser.', error);
        }
    }

    onFullscreenChange() {
        const active = Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
        this.root.dataset.fullscreen = active ? 'true' : 'false';
        this.fullscreenButton?.setAttribute('aria-pressed', String(active));

        const label = this.fullscreenButton?.querySelector('[data-fullscreen-label]');
        if (label) {
            label.textContent = active ? 'خروج' : 'تمام‌صفحه';
        }
    }

    onViewportChange() {
        const height = window.visualViewport?.height ?? window.innerHeight;
        document.documentElement.style.setProperty('--demian-vh', `${height * 0.01}px`);

        const portrait = window.innerHeight > window.innerWidth;
        const compactLandscape = window.innerHeight < 500 && window.innerWidth > window.innerHeight;
        this.root.dataset.orientation = portrait ? 'portrait' : 'landscape';
        this.root.dataset.compactLandscape = compactLandscape ? 'true' : 'false';

        if (this.orientationHint) {
            this.orientationHint.setAttribute('aria-hidden', String(!portrait));
        }
    }

    dispose() {
        this.actionsToggle?.removeEventListener('click', this.onActionsToggle);
        this.actionsTray?.removeEventListener('pointerdown', this.onActionPress);
        this.fullscreenButton?.removeEventListener('click', this.onFullscreen);
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
        window.removeEventListener('resize', this.onViewportChange);
        window.visualViewport?.removeEventListener('resize', this.onViewportChange);
    }
}
