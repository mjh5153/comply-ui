# ADR-0001: Use Playwright for end-to-end browser testing

- Status: Accepted
- Date: 2026-08-19

## Context

The Angular 22 zoneless migration needs browser-level evidence that user input,
real backend responses, reactive state, and the rendered DOM remain connected.
Unit and API tests cannot prove that the DOM updates after a complete request
through Angular, the Express BFF, and Spring Boot.

The browser suite must keep application network traffic real, make stale-DOM
behavior fail deterministically, and provide useful diagnostics without adding
a large scenario inventory.

## Decision

Use Playwright Test with one focused Chromium smoke scenario. Use web-first DOM
assertions, observe requests without stubbing them, retain traces on failure,
and fail on relevant browser or Angular runtime errors.

Dependency versions remain governed by `package.json` and `package-lock.json`,
not this record.

## Consequences

- The test validates that its observed application API calls complete a real
  browser-to-upstream round trip through the BFF.
- A rendered-but-stale DOM fails through polling assertions instead of relying
  on timing sleeps.
- Traces and failure screenshots provide browser, network, and DOM evidence.
- The Spring API and BFF must be available to run the suite.
- Chromium coverage does not imply Firefox or WebKit compatibility.
- The focused suite is a migration smoke gate, not a replacement for unit,
  component, or API tests.

## Alternatives considered

### Cypress

Rejected for this focused suite. Playwright's locators, web-first assertions,
request observation, and trace viewer align directly with the required
rendered-DOM and real-network checks. Cypress remains viable for other projects,
but introducing a second runner offers no benefit here.

### Cucumber

Rejected because a Gherkin layer adds maintenance overhead without improving a
single technical migration scenario.

### Unit or API tests only

Rejected because they cannot demonstrate that a real browser rendered the
updated result after the full application round trip.
