function isLikelyMobileDevice() {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const touchPoints = Number(navigator.maxTouchPoints ?? 0) > 0;
    const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '');

    return coarsePointer || (touchPoints && mobileUserAgent);
}

export default class MobileGameUI {
    constructor({ root }) {
        this.root = root;
        this.stage = root.querySelector('.manager-stage');
        this.actionsToggle = root.querySelector('[data-mobile-actions-toggle]');
        this.actionsTray = root.querySelector('[data-mobile-actions-tray]');
        this.fullscreenButton = root.querySelector('[data-mobile-fullscreen]');
        this.orientationHint = root.querySelector('[data-orientation-hint]');
        this.isExpanded = false;
        this.isMobileDevice = isLikelyMobileDevice();
        this.lastForcedLandscape = null;

        this.onActionsToggle = this.onActionsToggle.bind(this);
        this.onActionPress = this.onActionPress.bind(this);
        this.onFullscreen = this.onFullscreen.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
        this.onFirstInteraction = this.onFirstInteraction.bind(this);
    }

    boot() {
        const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.root.dataset.pointerMode = coarse ? 'coarse' : 'fine';
        this.root.dataset.mobileDevice = this.isMobileDevice ? 'true' : 'false';

        this.actionsToggle?.addEventListener('click', this.onActionsToggle);
        this.actionsTray?.addEventListener('pointerdown', this.onActionPress);
        this.fullscreenButton?.addEventListener('click', this.onFullscreen);
        this.stage?.addEventListener('pointerdown', this.onFirstInteraction, {
            passive: true,
            once: true,
        });
        document.addEventListener('fullscreenchange', this.onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
        window.addEventListener('resize', this.onViewportChange, { passive: true });
        window.addEventListener('orientationchange', this.onViewportChange, { passive: true });
        window.visualViewport?.addEventListener('resize', this.onViewportChange, { passive: true });
        screen.orientation?.addEventListener?.('change', this.onViewportChange);

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

    async onFirstInteraction() {
        if (!this.isMobileDevice) {
            return;
        }

        await this.lockLandscape().catch(() => undefined);
    }

    async lockLandscape() {
        const orientation = screen.orientation;
        if (!orientation?.lock) {
            return false;
        }

        try {
            await orientation.lock('landscape');
            this.root.dataset.nativeLandscapeLock = 'true';
            return true;
        } catch (error) {
            // iOS Safari and some Android browsers only allow orientation lock
            // in installed/fullscreen mode. CSS forced-landscape remains active.
            this.root.dataset.nativeLandscapeLock = 'false';
            return false;
        }
    }

    async unlockOrientation() {
        try {
            screen.orientation?.unlock?.();
        } catch (error) {
            console.debug('Orientation unlock was not available.', error);
        }
    }

    async onFullscreen() {
        try {
            const fullscreenElement = document.fullscreenElement ?? document.webkitFullscreenElement;
            if (fullscreenElement) {
                const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
                await exit?.call(document);
                await this.unlockOrientation();
            } else {
                const request = this.stage?.requestFullscreen ?? this.stage?.webkitRequestFullscreen;
                await request?.call(this.stage, { navigationUI: 'hide' });
                await this.lockLandscape();
            }
        } catch (error) {
            console.warn('Fullscreen mode is not available on this browser.', error);
            // Keep the CSS landscape fallback active even when fullscreen is denied.
            this.onViewportChange();
        }
    }

    onFullscreenChange() {
        const active = Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
        this.root.dataset.fullscreen = active ? 'true' : 'false';
        this.fullscreenButton?.setAttribute('aria-pressed', String(active));

        if (active) {
            this.lockLandscape().catch(() => undefined);
        }

        const label = this.fullscreenButton?.querySelector('[data-fullscreen-label]');
        if (label) {
            label.textContent = active ? 'خروج' : 'افقی تمام‌صفحه';
        }

        this.onViewportChange();
    }

    onViewportChange() {
        const viewportWidth = Math.max(
            1,
            Math.round(window.visualViewport?.width ?? window.innerWidth)
        );
        const viewportHeight = Math.max(
            1,
            Math.round(window.visualViewport?.height ?? window.innerHeight)
        );
        const physicalPortrait = viewportHeight > viewportWidth;
        const forcedLandscape = this.isMobileDevice && physicalPortrait;
        const logicalWidth = forcedLandscape ? viewportHeight : viewportWidth;
        const logicalHeight = forcedLandscape ? viewportWidth : viewportHeight;
        const compactLandscape = logicalHeight < 500;

        document.documentElement.style.setProperty('--demian-vh', `${logicalHeight * 0.01}px`);
        document.documentElement.style.setProperty('--demian-logical-width', `${logicalWidth}px`);
        document.documentElement.style.setProperty('--demian-logical-height', `${logicalHeight}px`);
        document.documentElement.classList.toggle('demian-forced-landscape', forcedLandscape);

        this.root.dataset.physicalOrientation = physicalPortrait ? 'portrait' : 'landscape';
        this.root.dataset.orientation = forcedLandscape || !physicalPortrait ? 'landscape' : 'portrait';
        this.root.dataset.forcedLandscape = forcedLandscape ? 'true' : 'false';
        this.root.dataset.compactLandscape = compactLandscape ? 'true' : 'false';

        if (this.orientationHint) {
            this.orientationHint.setAttribute('aria-hidden', 'true');
        }

        if (this.lastForcedLandscape !== forcedLandscape) {
            this.lastForcedLandscape = forcedLandscape;
            this.root.dispatchEvent(new CustomEvent('mobile:layout-changed', {
                bubbles: true,
                detail: {
                    forcedLandscape,
                    width: logicalWidth,
                    height: logicalHeight,
                },
            }));
        } else {
            window.requestAnimationFrame(() => {
                this.root.dispatchEvent(new CustomEvent('mobile:layout-changed', {
                    bubbles: true,
                    detail: {
                        forcedLandscape,
                        width: logicalWidth,
                        height: logicalHeight,
                    },
                }));
            });
        }
    }

    dispose() {
        this.actionsToggle?.removeEventListener('click', this.onActionsToggle);
        this.actionsTray?.removeEventListener('pointerdown', this.onActionPress);
        this.fullscreenButton?.removeEventListener('click', this.onFullscreen);
        this.stage?.removeEventListener('pointerdown', this.onFirstInteraction);
        document.removeEventListener('fullscreenchange', this.onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('orientationchange', this.onViewportChange);
        window.visualViewport?.removeEventListener('resize', this.onViewportChange);
        screen.orientation?.removeEventListener?.('change', this.onViewportChange);
        document.documentElement.classList.remove('demian-forced-landscape');
    }
}
