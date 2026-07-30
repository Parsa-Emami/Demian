import { GAME_CATALOG, findGameCatalogEntry } from '../catalog/GameCatalog';
import ScreenManager from './ScreenManager';
import BootScreen from './screens/BootScreen';
import CafeMenuScreen from './screens/CafeMenuScreen';
import GameSelectionScreen from './screens/GameSelectionScreen';
import LoadingScreen from './screens/LoadingScreen';
import PauseScreen from './screens/PauseScreen';
import SettingsScreen from './screens/SettingsScreen';
import ResultsScreen from './screens/ResultsScreen';

const SCREEN_IDS = Object.freeze({
    BOOT: 'boot',
    CAFE: 'cafe-menu',
    SELECTION: 'game-selection',
    LOADING: 'loading',
    PAUSE: 'pause',
    SETTINGS: 'settings',
    RESULTS: 'results',
});

function isTypingTarget(target) {
    return target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
}

/**
 * DOM shell orchestration. It owns navigation and view concerns only; gameplay
 * lifecycle remains inside GameApplication.
 */
export default class GameShell {
    constructor({ root, app, eventBus, animation, settings, catalog = GAME_CATALOG }) {
        this.root = root;
        this.app = app;
        this.eventBus = eventBus;
        this.animation = animation;
        this.settings = settings;
        this.catalog = catalog;
        this.shellRoot = root.querySelector('[data-game-shell]');
        this.manager = new ScreenManager({ eventBus });
        this.unsubscribers = [];
        this.booted = false;

        this.onClick = this.onClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onSettingsSubmit = this.onSettingsSubmit.bind(this);
    }

    boot() {
        if (this.booted || !this.shellRoot) return;
        this.booted = true;

        const screen = (id) => this.shellRoot.querySelector(`[data-screen="${id}"]`);
        this.bootScreen = new BootScreen({ id: SCREEN_IDS.BOOT, element: screen(SCREEN_IDS.BOOT), animation: this.animation });
        this.cafeScreen = new CafeMenuScreen({ id: SCREEN_IDS.CAFE, element: screen(SCREEN_IDS.CAFE), animation: this.animation });
        this.selectionScreen = new GameSelectionScreen({ id: SCREEN_IDS.SELECTION, element: screen(SCREEN_IDS.SELECTION), animation: this.animation, catalog: this.catalog });
        this.loadingScreen = new LoadingScreen({ id: SCREEN_IDS.LOADING, element: screen(SCREEN_IDS.LOADING), animation: this.animation });
        this.pauseScreen = new PauseScreen({ id: SCREEN_IDS.PAUSE, element: screen(SCREEN_IDS.PAUSE), animation: this.animation });
        this.settingsScreen = new SettingsScreen({ id: SCREEN_IDS.SETTINGS, element: screen(SCREEN_IDS.SETTINGS), animation: this.animation, settings: this.settings });
        this.resultsScreen = new ResultsScreen({ id: SCREEN_IDS.RESULTS, element: screen(SCREEN_IDS.RESULTS), animation: this.animation });

        [
            this.bootScreen,
            this.cafeScreen,
            this.selectionScreen,
            this.loadingScreen,
            this.pauseScreen,
            this.settingsScreen,
            this.resultsScreen,
        ].forEach((entry) => this.manager.register(entry));

        this.shellRoot.addEventListener('click', this.onClick);
        this.settingsScreen.form?.addEventListener('submit', this.onSettingsSubmit);
        window.addEventListener('keydown', this.onKeyDown);

        this.unsubscribers.push(
            this.eventBus.on('game:loading-step', ({ progress, step }) => {
                this.loadingScreen?.setProgress(progress, step);
            }),
            this.eventBus.on('game:load-failed', ({ error }) => {
                this.toast(error?.message ?? 'بارگذاری بازی ناموفق بود.', 'error');
            }),
            this.eventBus.on('game:completed', (result) => this.showResults(result))
        );
    }

    showBoot(payload = {}) {
        this.root.dataset.shellScreen = SCREEN_IDS.BOOT;
        return this.manager.show(SCREEN_IDS.BOOT, payload);
    }

    setBootProgress(progress, message) {
        this.bootScreen?.setProgress(progress, message);
    }

    showCafeMenu() {
        this.root.dataset.shellScreen = SCREEN_IDS.CAFE;
        return this.manager.show(SCREEN_IDS.CAFE);
    }

    showGameSelection() {
        this.root.dataset.shellScreen = SCREEN_IDS.SELECTION;
        return this.manager.show(SCREEN_IDS.SELECTION);
    }

    showLoading(gameId, { progress = 8, step } = {}) {
        const game = findGameCatalogEntry(gameId);
        this.root.dataset.shellScreen = SCREEN_IDS.LOADING;
        return this.manager.show(SCREEN_IDS.LOADING, {
            title: game?.title ?? gameId,
            progress,
            step,
        });
    }

    showPause(definition) {
        return this.manager.show(SCREEN_IDS.PAUSE, { title: definition?.title });
    }

    showSettings() {
        return this.manager.show(SCREEN_IDS.SETTINGS);
    }

    showResults(result = {}) {
        this.root.dataset.shellScreen = SCREEN_IDS.RESULTS;
        return this.manager.show(SCREEN_IDS.RESULTS, result);
    }

    hideAll(reason = 'playing') {
        this.root.dataset.shellScreen = 'none';
        return this.manager.hideAll(reason);
    }

    async onClick(event) {
        const button = event.target.closest('[data-shell-action], [data-game-launch]');
        if (!button || button.getAttribute('aria-disabled') === 'true') {
            if (button?.dataset.gameLaunch) {
                const game = findGameCatalogEntry(button.dataset.gameLaunch);
                this.toast(`${game?.title ?? 'این بازی'} در فاز ${game?.phase ?? 'بعدی'} فعال می‌شود.`, 'info');
            }
            return;
        }

        const gameId = button.dataset.gameLaunch;
        if (gameId) {
            await this.app.launchGame(gameId).catch(() => undefined);
            return;
        }

        switch (button.dataset.shellAction) {
            case 'play':
                await this.showGameSelection();
                break;
            case 'continue':
                await this.app.launchGame(this.app.activeGameId ?? 'open-world').catch(() => undefined);
                break;
            case 'menu':
                await this.app.showMenu();
                break;
            case 'back-selection':
                await this.showGameSelection();
                break;
            case 'back-cafe':
                await this.showCafeMenu();
                break;
            case 'settings':
                await this.showSettings();
                break;
            case 'close-modal':
                await this.manager.closeTopModal();
                break;
            case 'resume':
                this.app.resumeGame();
                break;
            case 'pause':
                this.app.pauseGame();
                break;
            case 'restart':
                await this.app.restartGame().catch(() => undefined);
                break;
            case 'replay': {
                const result = this.resultsScreen?.payload;
                if (result?.replay && result?.gameId) {
                    await this.app.launchGame(result.gameId, { replay: result.replay, forceReload: true }).catch(() => undefined);
                }
                break;
            }
            case 'exit-game':
                await this.app.exitGame();
                break;
            case 'reset-settings':
                this.settings.reset();
                await this.settingsScreen.beforeOpen();
                this.toast('تنظیمات به حالت پیش‌فرض برگشت.', 'success');
                break;
            default:
                break;
        }
    }

    async onSettingsSubmit(event) {
        event.preventDefault();
        this.settings.update(this.settingsScreen.readForm());
        await this.manager.close(SCREEN_IDS.SETTINGS, 'saved');
        this.toast('تنظیمات ذخیره شد.', 'success');
    }

    onKeyDown(event) {
        if (event.repeat || isTypingTarget(event.target) || event.key !== 'Escape') return;

        const topModal = this.manager.modalStack.at(-1);
        if (topModal === SCREEN_IDS.SETTINGS) {
            event.preventDefault();
            this.manager.closeTopModal('escape');
            return;
        }

        if (this.app.sessionState === 'playing') {
            event.preventDefault();
            this.app.pauseGame();
            return;
        }

        if (this.app.sessionState === 'paused') {
            event.preventDefault();
            this.app.resumeGame();
            return;
        }

        if (this.manager.primaryId === SCREEN_IDS.SELECTION) {
            event.preventDefault();
            this.showCafeMenu();
        }
    }

    toast(message, tone = 'info') {
        const host = this.shellRoot.querySelector('[data-shell-toast-host]');
        if (!host || !message) return;

        const toast = document.createElement('div');
        toast.className = `shell-toast shell-toast--${tone}`;
        toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        host.appendChild(toast);
        this.animation.reveal(toast, { duration: 220 });

        window.setTimeout(async () => {
            await this.animation.finished(this.animation.animate(toast, {
                opacity: [1, 0],
                y: [0, -8],
                duration: 180,
            }));
            toast.remove();
        }, 2800);
    }

    async dispose() {
        this.shellRoot?.removeEventListener('click', this.onClick);
        this.settingsScreen?.form?.removeEventListener('submit', this.onSettingsSubmit);
        window.removeEventListener('keydown', this.onKeyDown);
        this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.unsubscribers = [];
        await this.manager.dispose();
    }
}
