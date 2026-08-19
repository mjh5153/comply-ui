import {defineConfig} from 'vitest/config';

/**
 * Test config for the BFF (server/). Separate from the Angular unit-test
 * target, which runs in a browser-like environment via @angular/build.
 */
export default defineConfig({
    test: {
        include: ['server/**/*.spec.ts'],
        environment: 'node'
    }
});
