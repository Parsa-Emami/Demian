import { CAFE_ENVIRONMENT_ID, CAFE_REFERENCE_ASSET_ROOT } from '../shared/cafe/CafeEnvironmentContract.js';

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
            deployment: 'atomic-bundle',
            environment: CAFE_ENVIRONMENT_ID,
            environmentLocked: true,
            referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'dino-run': Object.freeze({
        title: 'Dino Run', inputContext: 'DINO_RUN', orientation: 'any',
        loader: () => import('../games/dino-run/DinoRunGame.js'),
        metadata: Object.freeze({ phase: 12, status: 'available', supportsResults: true, endless: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'atomic-bundle',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT }),
    }),
    'after-hours': Object.freeze({
        title: 'After Hours', inputContext: 'AFTER_HOURS', orientation: 'any',
        loader: () => import('../games/after-hours/AfterHoursGame.js'),
        metadata: Object.freeze({
            phase: 15, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'atomic-bundle',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
    'cafe-rush': Object.freeze({
        title: 'Café Rush', inputContext: 'CAFE_RUSH', orientation: 'any',
        loader: () => import('../games/cafe-rush/CafeRushGame.js'),
        metadata: Object.freeze({
            phase: 16, status: 'available', supportsResults: true,
            renderer: 'shared-canvas2d-pixel', deployment: 'atomic-bundle',
            environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
        }),
    }),
});
