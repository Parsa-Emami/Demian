import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

/**
 * Each game is a separately hashed on-demand module. The release workflow
 * retains prior hashed chunks, protecting still-open browser tabs.
 * Never deploy splitting without the release asset retention gate.
 */
export default defineConfig({
    // Portable across root domains, GitHub project Pages and nested hosting.
    // Absolute Vite CSS font URLs previously generated 404s under subpaths.
    base: './',
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
                codeSplitting: true,
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
