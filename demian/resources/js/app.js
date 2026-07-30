import '../css/app.css';
import GameApplication from './game/application/GameApplication';
import CharacterManagerUI from './ui/CharacterManagerUI';
import SidebarController from './ui/SidebarController';
import MobileGameUI from './ui/MobileGameUI';

document.addEventListener('DOMContentLoaded', async () => {
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
            managerProvider: () => application.characterManager,
            eventBus: application.eventBus,
        });
        ui.boot();
        application.synchronizeUi();

        // Exposed for diagnostics and later shell integration, not game logic.
        window.demianGameApplication = application;
    } catch (error) {
        console.error('Demian Game Platform could not start:', error);

        sceneContainer.innerHTML = `
            <div class="flex h-full items-center justify-center p-6">
                <div class="arcade-error">
                    <strong>موتور بازی اجرا نشد</strong>
                    <span>${error.message ?? 'خطای ناشناخته'}</span>
                    <small>فایل‌های public/assets/characters/tiam را بررسی کن.</small>
                </div>
            </div>
        `;
    }
});
