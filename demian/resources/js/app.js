import '../css/app.css';
import DemianStudio from './game/DemianStudio';
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

    const studio = new DemianStudio(sceneContainer, {
        apiBase: managerRoot.dataset.apiBase,
        csrfToken: document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content'),
    });

    managerRoot.addEventListener('sidebar:changed', () => {
        studio.handleLayoutChange();
    });

    sidebar.boot();
    mobileUI.boot();

    const ui = new CharacterManagerUI({
        root: managerRoot,
        manager: studio.characterManager,
        eventBus: studio.eventBus,
    });

    ui.boot();

    try {
        await studio.boot();
    } catch (error) {
        console.error('Demian Studio could not start:', error);

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
