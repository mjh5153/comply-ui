# End-to-end testing

Comply UI uses Playwright Test for a focused Chromium smoke test. The installed
version in `package-lock.json` is authoritative; `package.json` declares the
supported dependency range.

The suite uses web-first assertions against the rendered DOM. It deliberately
observes real network activity without stubbing it so failures in Angular
rendering, zoneless change detection, the Express BFF, or the Spring service are
visible as test failures rather than hidden by mocks.

## Scope

The smoke scenario verifies that:

- the Angular shell and a lazy route render;
- backend-derived company data reaches the DOM;
- form input is written back under zoneless change detection;
- saving a profile and re-evaluating changes rendered findings;
- observed application API requests use same-origin `/api/*` URLs and pass
  through the BFF;
- uncaught page errors, relevant failed requests, console errors, and Angular
  `NG0###` diagnostics fail the test.

The scenario is intentionally narrow. It does not claim cross-browser coverage
or exhaustive coverage of every Material overlay and form control.

## Request path

```text
Browser on :4200
  -> Angular company detail route
  -> ComplianceService
  -> /api/companies/:id/*
  -> Express BFF on :9000
  -> Spring Boot on :8080
  -> compliance result
  -> Angular state
  -> rendered DOM
```

No network route is mocked. This is a contract of the smoke test, because the
full round trip is the behavior being verified. The current request observer
collects URLs containing `/api/`; its assertions prove the route used by those
application calls, not the absence of every conceivable direct request to an
upstream port.

## Prerequisites

Install project dependencies and the Playwright Chromium binary:

```bash
npm ci
npx playwright install chromium
```

Start the Spring COMPLY API on port 8080 using the instructions in its own
repository. There is no Spring startup command in this repository.

In a separate terminal, start the Express BFF on port 9000:

```bash
npm run server
```

The Playwright configuration starts or reuses the Angular development server on
port 4200.

## Commands

Run the smoke test headlessly:

```bash
npm run e2e
```

Run it with a visible browser:

```bash
npm run e2e:headed
```

Run the other project checks independently:

```bash
npm test
npm run test:bff
npm run build
```

## Failure diagnostics

Playwright retains a trace and captures a screenshot when the test fails. Open
a retained trace with:

```bash
npx playwright show-trace test-results/**/trace.zip
```

Read the trace before attributing a timeout to the assertion that surfaced it.
The originating failure may instead be an upstream response, runtime warning,
navigation problem, or invalid test data.

Traces and screenshots may contain values entered into or rendered by the
application. Inspect and sanitize artifacts before sharing them publicly.

Test-created names and email addresses must be unique per run so the scenario
does not depend on the upstream service's existing data.

## Test design rules

- Assert user-visible rendered state, not HTTP success alone.
- Keep the BFF and Spring service in the request path.
- Do not intercept or fulfill application API calls in this smoke scenario.
- Use role- and label-based locators where practical.
- Make generated records unique and independent of existing row counts.
- Treat Angular runtime diagnostics as failures.
- Record exact run counts and temporary limitations in the pull request, not in
  this document.

## Current limitations

- Only Chromium is configured.
- The smoke test emphasizes the highest-risk number-input `ngModel` binding; it
  does not exercise every form control or overlay.
