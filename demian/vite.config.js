import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

/**
 * Demian is deployed as a static GitHub Pages application.
 *
 * The game registry intentionally remains asynchronous, but production uses
 * one atomic JavaScript bundle. A previous deployment removed content-hashed
 * game chunks while a cached shell still requested them, producing errors such
 * as `RolePlayGame-<hash>.js` and preventing the café world from starting.
 * Disabling Rolldown code splitting removes that failure class completely.
 */
export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
    build: {
        emptyOutDir: true,
        modulePreload: {
            polyfill: true,
        },
        rolldownOptions: {
            output: {
                codeSplitting: false,
                strictExecutionOrder: true,
            },
        },
    },
    server: {
        hmr: {
            overlay: true,
        },
    },
});
