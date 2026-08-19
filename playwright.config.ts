import {defineConfig, devices} from '@playwright/test';

/**
 * E2E config for verifying the Angular 22 / zoneless migration in a real browser.
 *
 * Deliberately minimal: one Chromium project, one spec. The suite exists to
 * answer a single question - did the upgrade break rendering that unit and API
 * tests cannot prove - not to provide broad coverage.
 *
 * The dev server is reused when already running. The Spring COMPLY API on :8080
 * and the Express BFF on :9000 must be up: this suite deliberately does NOT mock
 * them, because the round trip through both is the thing under test.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [['list']],

    use: {
        baseURL: 'http://localhost:4200',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        // No video: the trace already carries DOM snapshots, and video would be
        // artifact bloat for a single-test suite.
    },

    projects: [
        {name: 'chromium', use: {...devices['Desktop Chrome']}}
    ],

    webServer: {
        command: 'npm start',
        url: 'http://localhost:4200',
        reuseExistingServer: true,
        timeout: 180_000
    }
});
