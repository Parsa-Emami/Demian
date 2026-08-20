export function resolveMobileViewportMode({ sessionState = '', sidebarState = '' } = {}) {
    if (sidebarState === 'expanded') return 'character-sheet';
    if (['playing', 'paused'].includes(sessionState)) return 'gameplay';
    return 'shell';
}

export function shouldForceLandscape({
    isMobileDevice = false,
    physicalPortrait = false,
    preference = 'any',
    mode = 'shell',
} = {}) {
    return Boolean(
        isMobileDevice
        && physicalPortrait
        && preference === 'landscape'
    );
}

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
        this.attributeObserver = null;

        this.onActionsToggle = this.onActionsToggle.bind(this);
        this.onActionPress = this.onActionPress.bind(this);
        this.onFullscreen = this.onFullscreen.bind(this);
        this.onViewportChange = this.onViewportChange.bind(this);
        this.onFullscreenChange = this.onFullscreenChange.bind(this);
        this.onFirstInteraction = this.onFirstInteraction.bind(this);
        this.onOrientationPreferenceChanged = this.onOrientationPreferenceChanged.bind(this);
        this.onSidebarChanged = this.onSidebarChanged.bind(this);
        this.onRootAttributesChanged = this.onRootAttributesChanged.bind(this);
    }

    boot() {
        const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.root.dataset.pointerMode = coarse ? 'coarse' : 'fine';
        this.root.dataset.mobileDevice = this.isMobileDevice ? 'true' : 'false';

        if (this.isMobileDevice) {
            this.lockPreferredOrientation().catch(() => undefined);
        }

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
        this.root.addEventListener('game:orientation-changed', this.onOrientationPreferenceChanged);
        this.root.addEventListener('sidebar:changed', this.onSidebarChanged);

        if (typeof MutationObserver !== 'undefined') {
            this.attributeObserver = new MutationObserver(this.onRootAttributesChanged);
            this.attributeObserver.observe(this.root, {
                attributes: true,
                attributeFilter: ['data-session-state', 'data-shell-screen', 'data-sidebar-state', 'data-game-orientation'],
            });
        }

        this.stage?.addEventListener('contextmenu', (event) => event.preventDefault());
        this.onViewportChange();
        this.applyExpandedState();
    }


    gameplayActive() {
        return ['playing', 'paused'].includes(this.root.dataset.sessionState ?? '');
    }

    characterSheetExpanded() {
        return this.root.dataset.sidebarState === 'expanded';
    }

    viewportMode() {
        return resolveMobileViewportMode({
            sessionState: this.root.dataset.sessionState,
            sidebarState: this.root.dataset.sidebarState,
        });
    }

    onRootAttributesChanged() {
        this.onViewportChange();
    }

    async onSidebarChanged(event) {
        const expanded = event.detail?.expanded ?? this.characterSheetExpanded();
        if (this.isMobileDevice && expanded) {
            await this.unlockOrientation();
        } else if (document.fullscreenElement ?? document.webkitFullscreenElement) {
            await this.lockPreferredOrientation().catch(() => undefined);
        }
        this.onViewportChange();
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

        await this.lockPreferredOrientation().catch(() => undefined);
    }

    orientationPreference() {
        return this.root.dataset.gameOrientation ?? 'any';
    }

    async lockPreferredOrientation() {
        const preference = this.orientationPreference();
        if (preference === 'any') return false;
        const orientation = screen.orientation;
        if (!orientation?.lock) {
            return false;
        }

        try {
            await orientation.lock(preference === 'portrait' ? 'portrait-primary' : 'landscape');
            this.root.dataset.nativeOrientationLock = preference;
            return true;
        } catch (error) {
            // iOS Safari and some Android browsers only allow orientation lock
            // in installed/fullscreen mode. CSS forced-landscape remains active.
            this.root.dataset.nativeOrientationLock = 'false';
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
                await this.lockPreferredOrientation();
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
            this.lockPreferredOrientation().catch(() => undefined);
        }

        const label = this.fullscreenButton?.querySelector('[data-fullscreen-label]');
        if (label) {
            const preference = this.orientationPreference();
            label.textContent = active ? 'خروج' : preference === 'landscape' ? 'افقی تمام‌صفحه' : 'تمام‌صفحه';
        }

        this.onViewportChange();
    }


    async onOrientationPreferenceChanged() {
        await this.unlockOrientation();
        const fullscreenElement = document.fullscreenElement ?? document.webkitFullscreenElement;
        if (fullscreenElement) {
            await this.lockPreferredOrientation().catch(() => undefined);
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
        const preference = this.orientationPreference();
        const mode = this.viewportMode();
        const forcedLandscape = shouldForceLandscape({
            isMobileDevice: this.isMobileDevice,
            physicalPortrait,
            preference,
            mode,
        });
        const logicalWidth = forcedLandscape ? viewportHeight : viewportWidth;
        const logicalHeight = forcedLandscape ? viewportWidth : viewportHeight;
        const compactLandscape = logicalHeight < 500;
        const viewportTop = Math.max(0, Math.round(window.visualViewport?.offsetTop ?? 0));
        const viewportLeft = Math.max(0, Math.round(window.visualViewport?.offsetLeft ?? 0));

        document.documentElement.style.setProperty('--demian-vh', `${logicalHeight * 0.01}px`);
        document.documentElement.style.setProperty('--demian-logical-width', `${logicalWidth}px`);
        document.documentElement.style.setProperty('--demian-logical-height', `${logicalHeight}px`);
        document.documentElement.style.setProperty('--demian-viewport-top', `${viewportTop}px`);
        document.documentElement.style.setProperty('--demian-viewport-left', `${viewportLeft}px`);
        document.documentElement.classList.toggle('demian-forced-landscape', forcedLandscape);

        this.root.dataset.physicalOrientation = physicalPortrait ? 'portrait' : 'landscape';
        this.root.dataset.orientation = forcedLandscape || !physicalPortrait ? 'landscape' : 'portrait';
        this.root.dataset.forcedLandscape = forcedLandscape ? 'true' : 'false';
        this.root.dataset.compactLandscape = compactLandscape ? 'true' : 'false';
        this.root.dataset.viewportMode = mode;
        document.body.classList.toggle('is-gameplay-active', mode === 'gameplay');

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
        this.root.removeEventListener('game:orientation-changed', this.onOrientationPreferenceChanged);
        this.root.removeEventListener('sidebar:changed', this.onSidebarChanged);
        this.attributeObserver?.disconnect();
        this.attributeObserver = null;
        document.documentElement.classList.remove('demian-forced-landscape');
        document.body.classList.remove('is-gameplay-active');
    }
}
