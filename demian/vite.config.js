import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './',
    plugins: [
        laravel({ input: ['resources/js/app.js'], refresh: true }),
        tailwindcss(),
    ],
    build: {
        emptyOutDir: true,
        modulePreload: { polyfill: true },
        rolldownOptions: {
            output: {
                codeSplitting: true,
                strictExecutionOrder: true,
            },
        },
    },
    server: { hmr: { overlay: true } },
});
