import '../css/app.css';
import '../css/mobile-character-polish.css';
import '../css/mobile-performance-fix.css';
import '../css/arcade-minigames.css';
import '../css/mobile-release.css';
import '../css/after-hours.css';
import '../css/cafe-rush.css';
import '../css/cafe-critters.css';
import '../css/coffee-crash.css';
import '../css/touch-controls.css';
import '../css/game-hud.css';
import '../css/ranked-route-challenge.css';
import '../css/device-qa.css';
import '../css/mobile-05-touch.css';
import '../css/pwa-update.css';
import '../css/mobile-08-leaderboard.css';
import '../css/mobile-09-offline.css';
import '../css/weekly-13-ui.css';
import '../css/mobile-19-controls.css';
import '../css/phase4-step20-ux.css';
import '../css/phase4-step21-feedback.css';
import '../css/phase5-step23-dino-run.css';
import '../css/phase6-step31-mobile-menu.css';
import '../css/phase6-step32-legal.css';
import '../css/experience-motion.css';
import '../css/weekly-game-refresh.css';
import '../css/phase1-game-experience.css';
import '../css/phase7-ux-audio.css';
import GameApplication from './game/application/GameApplication';
import CharacterManagerUI from './ui/CharacterManagerUI';
import SidebarController from './ui/SidebarController';
import MobileGameUI from './ui/MobileGameUI';
import MobilePerformanceManager from './game/performance/MobilePerformanceManager.js';
import registerDemianPwa from './game/performance/PwaUpdateController.js';

document.addEventListener('DOMContentLoaded', async () => {
    new MobilePerformanceManager().mount();
    const sceneContainer = document.querySelector('[data-demian-scene]');
    const managerRoot = document.querySelector('[data-character-manager]');
    if (!sceneContainer || !managerRoot) {
        return;
    }

    const sidebar = new SidebarController({ root: managerRoot });
    const mobileUI = new MobileGameUI({ root: managerRoot });
    const application = new GameApplication(sceneContainer, {
        apiBase: managerRoot.dataset.apiBase,
        eventApiBase: managerRoot.dataset.eventApiBase,
        csrfToken: document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content'),
    });
    managerRoot.addEventListener('sidebar:changed', () => {
        application.handleLayoutChange();
    });

    managerRoot.addEventListener('mobile:layout-changed', () => {
        application.handleLayoutChange();
    });

    sidebar.boot();
    mobileUI.boot();

    try {
        await application.boot();
        const ui = new CharacterManagerUI({
            root: managerRoot,
            managerProvider: () => application.characterManager ?? application.menuCharacterRoster,
            eventBus: application.eventBus,
        });
        ui.boot();
        application.synchronizeUi();

        // Exposed for diagnostics and later shell integration, not game logic.
        window.demianGameApplication = application;
        const pending = managerRoot.dataset.pendingMenuAction;
        delete managerRoot.dataset.pendingMenuAction;
        delete managerRoot.dataset.instantMenu;
        document.dispatchEvent(new Event('demian:menu-hydrated'));
        managerRoot.querySelector('[data-instant-menu-status]')?.remove();
        // A click during slow JS download is replayed through the normal
        // hydrated shell router only once; no separate game-start path.
        if (['play', 'continue', 'settings', 'leaderboard', 'rewards'].includes(pending)) {
            managerRoot.querySelector('[data-screen="cafe-menu"] [data-shell-action="' + pending + '"]')?.click();
        }
        // Static hosting/PWA is optional. Never block gameplay startup.
        void registerDemianPwa({ app: application });
    } catch (error) {
        console.error('Demian Game Platform could not start:', error);
        document.dispatchEvent(new Event('demian:menu-hydrated'));
        if (managerRoot?.dataset.instantMenu === 'true') {
            delete managerRoot.dataset.instantMenu;
            delete managerRoot.dataset.pendingMenuAction;
            managerRoot.querySelectorAll('[data-screen="cafe-menu"] [data-shell-action]')
                .forEach(button => { button.disabled = true; });
            const status = managerRoot.querySelector('[data-instant-menu-status]')
                ?? document.createElement('p');
            status.setAttribute('role', 'alert');
            status.textContent = 'اجرای دمیان ناموفق بود؛ صفحه را به‌روزرسانی کنید.';
            managerRoot.querySelector('[data-screen="cafe-menu"] .cafe-menu__actions')
                ?.append(status);
        }
        // Do not put error.message into innerHTML: errors may include a URL
        // or other untrusted network payload. Keep all visible text inert.
        sceneContainer.replaceChildren();
        const panel = document.createElement('div');
        panel.className = 'arcade-error';
        panel.setAttribute('role', 'alert');
        const heading = document.createElement('strong');
        heading.textContent = 'موتور بازی اجرا نشد';
        const detail = document.createElement('span');
        detail.textContent = error instanceof Error ? error.message.slice(0, 300) : 'خطای ناشناخته';
        const hint = document.createElement('small');
        hint.textContent = 'اتصال اینترنت و فایل‌های بازی را بررسی کن و دوباره تلاش کن.';
        panel.append(heading, detail, hint);
        sceneContainer.append(panel);
    }
});
