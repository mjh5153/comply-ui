

import {test, expect, Page, Request} from '@playwright/test';

/**
 * Angular 22 / TypeScript 6 / zoneless migration verification.
 *
 * ONE test, by design. The scenario budget for this repository computes to zero
 * additional E2E tests, so rather than adding scenarios this single smoke test is
 * strengthened until it can fail for every reason the migration could break.
 *
 * It must fail if ANY of these regress:
 *
 *   - the Angular app boots but the shell does not render
 *   - a lazy route chunk fails to load
 *   - backend-derived data never reaches the DOM
 *   - [(ngModel)] stops writing user input back to the model (zoneless risk)
 *   - the DOM goes stale after a real backend response (zoneless risk)
 *   - the Express BFF is bypassed
 *   - an Angular runtime error occurs
 *
 * Nothing is mocked. The business action travels:
 *   browser -> Angular -> Express BFF (:9000) -> Spring Boot (:8080) -> back -> DOM
 */

/** Collects anything that would invalidate the upgrade. */
function watchForRuntimeErrors(page: Page) {
    const errors: string[] = [];

    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

    page.on('console', msg => {
        if (msg.type() !== 'error') {
            return;
        }
        const text = msg.text();
        // Favicon 404s and Google Fonts noise are not Angular runtime errors.
        if (/favicon|fonts\.googleapis|fonts\.gstatic/i.test(text)) {
            return;
        }
        errors.push(`console.error: ${text}`);
    });

    // Angular diagnostics are emitted as warnings but indicate real defects -
    // NG0956 (bad @for track expression) was introduced by the v21 migration.
    page.on('console', msg => {
        if (msg.type() === 'warning' && /\bNG0\d{3}\b/.test(msg.text())) {
            errors.push(`angular warning: ${msg.text().split('.')[0]}`);
        }
    });

    page.on('requestfailed', req => {
        const url = req.url();
        if (/favicon|fonts\.googleapis|fonts\.gstatic/i.test(url)) {
            return;
        }
        errors.push(`requestfailed: ${req.method()} ${url} - ${req.failure()?.errorText}`);
    });

    return errors;
}

test('Angular 22 zoneless: real browser round trip through BFF to Spring and back into the DOM', async ({page}) => {

    const runtimeErrors = watchForRuntimeErrors(page);

    // Record the API calls the browser actually makes, to prove the BFF is in
    // the path and that nothing talks to Spring (:8080) directly.
    const apiRequests: Request[] = [];
    page.on('request', req => {
        if (req.url().includes('/api/')) {
            apiRequests.push(req);
        }
    });

    // ---------------------------------------------------------------------
    // 1. App shell renders
    // ---------------------------------------------------------------------
    await page.goto('/companies');

    await expect(page.getByRole('heading', {name: 'Companies', level: 1})).toBeVisible();
    // Toolbar is part of the NgModule shell; the page body is a lazy standalone
    // component. Asserting both proves the lazy chunk loaded.
    await expect(page.getByRole('link', {name: 'Companies'})).toBeVisible();

    // ---------------------------------------------------------------------
    // 2. The list endpoint is reachable through the BFF.
    //
    // Deliberately NOT asserting that rows already exist. CI runs against a
    // fresh in-memory H2 with zero companies, and a test that needs
    // pre-existing data passes or fails on the environment rather than on the
    // application. The row this test creates below is the backend-derived data
    // it then requires the DOM to render.
    // ---------------------------------------------------------------------
    const listResponse = await page.request.get('http://localhost:9000/api/companies');
    expect(listResponse.ok()).toBeTruthy();

    // ---------------------------------------------------------------------
    // 3. Create a company through the browser form.
    //    Proves: reactive form input -> POST -> Spring persists -> list re-renders.
    // ---------------------------------------------------------------------
    // The Spring entity declares @Column(email, unique = true), so a fixed
    // address collides on the second run. Both fields must be unique per run.
    const stamp = Date.now();
    const unique = `E2E Verify ${stamp}`;

    await page.getByLabel('Name').fill(unique);
    await page.getByLabel('Email').fill(`e2e-${stamp}@verify.test`);
    await page.getByRole('button', {name: 'Create'}).click();

    // The new card must appear because the list reloaded from the backend,
    // not because of optimistic local state.
    const newCard = page.getByRole('heading', {name: unique, level: 3});
    await expect(newCard).toBeVisible();

    // Now hold the DOM to the backend's own answer: every company the API
    // reports must be on screen. This works on an empty database and a full
    // one, and still fails if Angular receives rows it never renders.
    const afterCreate = await page.request.get('http://localhost:9000/api/companies');
    const companies: Array<{id: number, name: string}> = await afterCreate.json();
    expect(companies.some(c => c.name === unique)).toBeTruthy();

    for (const company of companies) {
        await expect(
            page.getByRole('heading', {name: company.name, level: 3}).first()
        ).toBeVisible();
    }

    // ---------------------------------------------------------------------
    // 4. Navigate to the detail view for the company we just created
    // ---------------------------------------------------------------------
    await newCard.locator('xpath=ancestor::mat-card')
        .getByRole('link', {name: 'Investigate compliance'})
        .click();

    await expect(page.getByRole('heading', {name: unique, level: 1})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Processing profile'})).toBeVisible();

    const findingsHeading = page.getByRole('heading', {name: /^Findings/});
    await expect(findingsHeading).toBeVisible();

    // ---------------------------------------------------------------------
    // 5. THE ZONELESS CAVEAT.
    //
    // [(ngModel)]="p.retentionDays" binds a PLAIN OBJECT PROPERTY, not a signal.
    // Under zoneless change detection this is the documented risk: typing may
    // update the DOM but never reach the model, or reach the model but never
    // re-render.
    //
    // Retention 1 day is under every purpose ceiling, so RET-001 must NOT fire.
    // ---------------------------------------------------------------------
    const retention = page.getByLabel('Retention (days)');
    await expect(retention).toBeVisible();

    await retention.click();
    await retention.fill('');
    await retention.fill('1');
    // The input itself must reflect the typing.
    await expect(retention).toHaveValue('1');
    await retention.blur();

    await page.getByRole('button', {name: 'Save & re-evaluate'}).click();

    // The engine result must come back and the DOM must drop RET-001.
    // This is a web-first assertion: if change detection is broken and the DOM
    // goes stale, this times out rather than racing to a false pass.
    await expect(page.getByText('RET-001', {exact: true})).toHaveCount(0);

    // ---------------------------------------------------------------------
    // 6. Now push retention far past every ceiling. RET-001 MUST reappear.
    //
    // Asserting a rule id appears AND disappears is what makes this test
    // impossible to satisfy with an HTTP 200 alone: the DOM has to change in
    // both directions in response to real backend output.
    // ---------------------------------------------------------------------
    await retention.fill('');
    await retention.fill('99999');
    await expect(retention).toHaveValue('99999');
    await retention.blur();

    await page.getByRole('button', {name: 'Save & re-evaluate'}).click();

    await expect(page.getByText('RET-001', {exact: true})).toHaveCount(1);

    // The finding's rendered detail must reflect the value we typed, proving the
    // number reached the engine rather than a stale default being re-sent.
    await expect(page.getByText(/99999 days/)).toBeVisible();

    // Law mappings render (backend-derived, per finding).
    await expect(page.getByText(/GDPR Art\. 5\(1\)\(e\)/).first()).toBeVisible();

    // Provenance must be surfaced, not silently dropped.
    await expect(page.getByText(/ENGINE · FIXTURE/)).toBeVisible();

    // ---------------------------------------------------------------------
    // 7. Prove the BFF was actually in the path
    // ---------------------------------------------------------------------
    const urls = apiRequests.map(r => r.url());

    expect(urls.some(u => u.includes('/api/companies'))).toBeTruthy();
    expect(urls.some(u => /\/api\/companies\/\d+\/evaluate/.test(u))).toBeTruthy();

    // The browser must never address Spring directly.
    expect(urls.filter(u => u.includes(':8080'))).toEqual([]);

    // Everything the browser asked for went to the Angular origin, which
    // proxies /api to the BFF.
    for (const url of urls) {
        expect(url.startsWith('http://localhost:4200/api/')).toBeTruthy();
    }

    // ---------------------------------------------------------------------
    // 8. No Angular runtime errors
    // ---------------------------------------------------------------------
    expect(runtimeErrors).toEqual([]);
});
