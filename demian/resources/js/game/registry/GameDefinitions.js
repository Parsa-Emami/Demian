import { CAFE_ENVIRONMENT_ID, CAFE_REFERENCE_ASSET_ROOT } from '../shared/cafe/CafeEnvironmentContract.js';

/** Game styles are loaded only with the selected game's module. */
async function withGameStyle(moduleLoader, styleLoader) {
    if (typeof document === 'undefined') return moduleLoader();
    const [game] = await Promise.all([moduleLoader(), styleLoader()]);
    return game;
}

export const GAME_DEFINITIONS = Object.freeze({
    'open-world': Object.freeze({
        title: 'Open World',
        inputContext: 'OPEN_WORLD',
        orientation: 'any',
        loader: () => import('../games/open-world/OpenWorldGame.js'),
        metadata: Object.freeze({
            phase: 8,
            status: 'available',
            shellBackdrop: true,
            supportsResults: false,
            chunkStreaming: true,
            worldManifest: CAFE_ENVIRONMENT_ID,
            miniMap: true,
            worldMap: true,
            aiBudgeting: true,
            persistentSavePoints: true,
            renderer: 'shared-canvas2d-pixel',
            deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID,
            environmentLocked: true,
            referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'dino-run': Object.freeze({
        title: 'Dino Run', inputContext: 'DINO_RUN', orientation: 'any',
        loader: () => withGameStyle(
            () => import('../games/dino-run/DinoRunGame.js'),
            () => import('../../../css/phase5-step23-dino-run.css'),
        ),
        metadata: Object.freeze({ phase: 12, status: 'available', supportsResults: true, endless: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT }),
    }),
    'after-hours': Object.freeze({
        title: 'After Hours', inputContext: 'AFTER_HOURS', orientation: 'any',
        loader: () => withGameStyle(
            () => import('../games/after-hours/AfterHoursGame.js'),
            () => import('../../../css/after-hours.css'),
        ),
        metadata: Object.freeze({
            phase: 15, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'cafe-rush': Object.freeze({
        title: 'Café Rush', inputContext: 'CAFE_RUSH', orientation: 'any',
        loader: () => withGameStyle(
            () => import('../games/cafe-rush/CafeRushGame.js'),
            async () => {
                // Both games reuse the After Hours shift-dialog controls.
                // Keep shared CSS before game CSS for mobile 44px targets.
                await import('../../../css/after-hours.css');
                await import('../../../css/cafe-rush.css');
            },
        ),
        metadata: Object.freeze({
            phase: 16, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'cafe-critters': Object.freeze({
        title: 'Café Critters', inputContext: 'CAFE_CRITTERS', orientation: 'any',
        loader: () => withGameStyle(
            () => import('../games/cafe-critters/CafeCrittersGame.js'),
            async () => {
                // Both games reuse the After Hours shift-dialog controls.
                // Keep shared CSS before game CSS for mobile 44px targets.
                await import('../../../css/after-hours.css');
                await import('../../../css/cafe-critters.css');
            },
        ),
        metadata: Object.freeze({
            phase: 17, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'cafe-drift': Object.freeze({
        title: 'Café Drift', inputContext: 'CAFE_DRIFT', orientation: 'any',
        loader: () => withGameStyle(
            () => import('../games/cafe-drift/CafeDriftGame.js'),
            () => import('../../../css/cafe-drift.css'),
        ),
        metadata: Object.freeze({
            phase: 19, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'coffee-crash': Object.freeze({
        title: 'Coffee Crash', inputContext: 'COFFEE_CRASH', orientation: 'any',
        loader: () => withGameStyle(
            () => import('../games/coffee-crash/CoffeeCrashGame.js'),
            () => import('../../../css/coffee-crash.css'),
        ),
        metadata: Object.freeze({
            phase: 18, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'versioned-chunks',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
});
