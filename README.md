# Comply-UI

# Installation pre-requisites

Angular 22 requires Node `^22.22.3`, `^24.15.0`, or `>=26.0.0`. Older Node 22
releases will fail to build.

    npm install

Install the Playwright browser binary once, for the end-to-end suite:

    npx playwright install chromium

# Stack

| Piece | Version |
| --- | --- |
| Angular | 22 (zoneless change detection, standalone feature components) |
| TypeScript | 6 |
| RxJS | 7 |
| Angular Material | 22 |
| Unit tests | Vitest via `@angular/build:unit-test` |
| Browser tests | Playwright (Chromium) |
| BFF | Express on ts-node |

The application bootstraps with `provideZonelessChangeDetection()` and `zone.js`
is not installed. Component state uses signals; change detection is driven by
signal writes and template event bindings.

# To Run the Development Backend Server

Start the Express BFF with:

    npm run server

It listens on port 9000 and does two jobs: it proxies `/api` to the Spring
COMPLY API, and it serves the compliance engine described below. It logs which
engine implementation is active on startup.

# Architecture

Comply UI is a Backend For Frontend (BFF) in front of the Spring Boot COMPLY API. The browser never calls the Spring service directly.

    browser
       |
       |  /api/companies
       v
    Angular          :4200 dev only, proxies /api via proxy.json
       |
       v
    BFF (server/)    :9000  Express
       |                    |
       |                    +-- proxies company routes to the COMPLY API
       |                    +-- SERVES the compliance engine itself
       v
    COMPLY API       :8080  Spring Boot
                            GET /companies/1

Two kinds of route pass through the BFF, and the difference matters:

- **Company routes are proxied.** They reach Spring and its database. A company
  you create is genuinely persisted upstream.
- **Compliance routes are served by the BFF.** The Spring service exposes no
  compliance endpoints - its OpenAPI document declares a single schema,
  `CompanyDTO` - so findings are produced by a deterministic engine inside
  Express. Every such response carries `provenance.mode: "fixture"`, and the UI
  labels it, so engine output is never presented as COMPLY API output.

Keeping the BFF in the middle means the Angular client always calls same-origin relative paths, so no CORS configuration is needed in development, and the upstream API address is a single environment variable rather than something baked into the bundle.

In production the same Express process also serves the compiled Angular app, so the browser still sees one origin. See **Production deployment** below.

# REST API Endpoints

The BFF runs on port **9000** (`npm run server`). Every route below is reachable from the Angular app as a relative `/api/...` path.

If no Angular build is present the BFF is API-only, and `http://localhost:9000/` returns `Cannot GET /`. That is expected — request an `/api/*` path instead. Once `npm run build` has produced `dist/`, the same process serves the built app at `/`.

## COMPLY API - proxied to Spring Boot

These forward to the Spring service at `COMPLY_API_BASE_URL` (default `http://localhost:8080`). The Spring service exposes companies at its root, and the BFF re-publishes them under `/api` so one proxy rule covers everything.

| Method | BFF route | Upstream | Body |
| --- | --- | --- | --- |
| `GET` | `/api/companies` | `GET /companies` | — |
| `POST` | `/api/companies` | `POST /companies` | `CompanyDTO` |
| `GET` | `/api/companies/:id` | `GET /companies/{id}` | — |
| `PUT` | `/api/companies/:id` | `PUT /companies/{id}` | `CompanyDTO` |
| `DELETE` | `/api/companies/:id` | `DELETE /companies/{id}` | — |
| `PUT` | `/api/companies/:id/async` | `PUT /companies/{id}/async` | `CompanyDTO` |
| `POST` | `/api/companies/async` | `POST /companies/async` | `CompanyDTO` |
| `POST` | `/api/companies/batch/async` | `POST /companies/batch/async` | `CompanyDTO[]` |
| `POST` | `/api/comply/process` | `POST /api/comply/process` | `CompanyDTO` |
| `POST` | `/api/comply/process/batch` | `POST /api/comply/process/batch` | `CompanyDTO[]` |
| `POST` | `/api/comply/reconcile` | `POST /api/comply/reconcile` | `string[]` |
| `POST` | `/api/comply/external-api/concurrent` | same path | `{ [key: string]: string }` |

`CompanyDTO` is `{ id?: number, name: string, email: string }` — `id` is server-assigned.

Call them from Angular through `CompaniesService` (`src/app/services/companies.service.ts`), which covers every route above. COMPLY responses have **no `payload` envelope**; the DTO is returned directly. The compliance routes are reached through `ComplianceService` (`src/app/services/compliance.service.ts`).

    curl http://localhost:9000/api/companies

    curl -X POST http://localhost:9000/api/companies \
      -H 'Content-Type: application/json' \
      -d '{"name":"Acme Corp","email":"ops@acme.test"}'

### Status codes are relayed unchanged

The BFF does not normalise upstream responses. Notably, **create returns `201`, not the `200` the OpenAPI document advertises**, and `DELETE` returns `204`. An unknown company id returns Spring's `404` rather than an empty `200`. Client code should read the real status.

The BFF adds four statuses of its own:

| Status | Meaning |
| --- | --- |
| `400` | Malformed request caught before the upstream call — a non-numeric company id, or a missing required `apiEndpoint` |
| `403` | `apiEndpoint` rejected by `COMPLY_EXTERNAL_API_ALLOWLIST` |
| `502` | The COMPLY API could not be reached |
| `504` | The COMPLY API did not respond within `COMPLY_API_TIMEOUT_MS` |

`502` and `504` are distinguished on purpose: on Render a free-tier service spins down when idle, so the first request after a quiet period can time out legitimately while the app service cold-starts.

## GET /api/health

Readiness probe, used as the Render health check. Reports whether the BFF can currently reach the Spring service — the failure mode most likely in a split deployment.

    { "status": "ok",
      "complyApiBaseUrl": "http://localhost:8080",
      "upstream": { "reachable": true, "status": 200 } }

Returns `503` with `"status": "degraded"` when the upstream is unreachable.

## Compliance engine - served by the BFF

These do **not** reach Spring. They are produced by the engine in
`server/compliance/`. Each route confirms the company exists upstream before
evaluating anything for it, so the two halves cannot drift apart.

| Method | BFF route | Returns |
| --- | --- | --- |
| `GET` | `/api/comply/rules` | Rule catalogue with GDPR law mappings and each rule's `requiredFacts` |
| `GET` | `/api/companies/:id/profile` | The company's processing profile (seeded deterministically from its id) |
| `PUT` | `/api/companies/:id/profile` | Stores a replacement profile |
| `POST` | `/api/companies/:id/evaluate` | `EvaluationResult` - findings with severity, applicability, triggering facts, controls |
| `POST` | `/api/companies/:id/evaluate/scenario` | Baseline vs modified evaluation plus a computed delta |
| `POST` | `/api/explain` | Plain-language explanation of one finding, `provenance.source: "ai"` |

    curl http://localhost:9000/api/comply/rules

    curl -X POST http://localhost:9000/api/companies/1/evaluate

    curl -X POST http://localhost:9000/api/companies/1/evaluate/scenario \
      -H 'Content-Type: application/json' \
      -d '{"modifications":[{"path":"retentionDays","to":30}]}'

### Provenance is structural, not cosmetic

Three sources appear in the UI and must never blur together. Every object
carries its own `provenance` block rather than relying on an envelope, because
an envelope's provenance is lost the moment a component destructures it.

| `source` | Meaning |
| --- | --- |
| `engine` | Deterministic rule output. Authoritative for compliance results |
| `analyst` | Human decision |
| `ai` | Generated explanation. Never authoritative, never overwrites an engine field |

`mode` is `fixture` or `live`. It reports where the engine ran, so the label
changes on its own when the engine moves to Spring.

### Applicability is derived, not assigned

A finding's applicability follows from how complete the profile is:

    predicate false                                -> NOT_APPLICABLE
    predicate holds only under a stated assumption -> POSSIBLE
    predicate true, a requiredFact is absent       -> LIKELY
    predicate true, every requiredFact present     -> CONFIRMED

This is why "why is this LIKELY?" is answerable without a model: the answer is
the list of absent facts on the finding.

### Swapping in the real engine

`ComplianceEngine` (`server/compliance/types.ts`) has two implementations,
selected by `COMPLY_ENGINE_MODE`. When Spring grows compliance endpoints, fill
in `UpstreamComplianceEngine`, set the variable to `live`, and no Angular code
changes - the wire contract and route paths are identical, and only
`provenance.mode` flips.

# Configuration

The BFF is configured entirely through environment variables (`server/config.ts`). See `.env.example` for the annotated list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9000` | Listen port. Render injects this — do not set it there |
| `COMPLY_API_BASE_URL` | `http://localhost:8080` | Base URL of the Spring Boot service |
| `COMPLY_API_TIMEOUT_MS` | `15000` | Upstream timeout before returning `504` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200` | Comma-separated browser origins. Unused when the BFF serves the UI |
| `COMPLY_EXTERNAL_API_ALLOWLIST` | *(unset)* | URL prefixes accepted by `apiEndpoint`. **Set this before exposing the BFF publicly** |
| `COMPLY_ENGINE_MODE` | `fixture` | Which `ComplianceEngine` runs. `fixture` evaluates rules inside the BFF; `live` forwards to Spring and currently throws, because those endpoints do not exist yet |

`apiEndpoint` on `/api/comply/external-api/concurrent` names a URL the Spring service will then call. Forwarded unchecked on a public host, it lets an outside caller aim the app service at an arbitrary address, including internal ones. Unset it stays permissive so local development is unaffected, and the BFF logs a warning when `NODE_ENV=production`.

# Production deployment

Render, two services:

| Render service | What it runs | Notes |
| --- | --- | --- |
| `comply-ui` (web) | This repo — Express serving `dist/` **and** `/api` | Build `npm ci && npm run build`, start `npm run start:prod` |
| `comply-api` (web) | Spring Boot, separate repo | Reached only by the BFF |

`render.yaml` in the repo root declares the web service. Set `COMPLY_API_BASE_URL` to the Spring service's URL; everything else has a working default.

Because one process serves both the UI and `/api`, the browser stays on a single origin in production and **no CORS setup is required**. `environment.prod.ts` therefore leaves `apiBaseUrl` empty so requests stay relative.

If you later split the UI onto its own static origin, set `apiBaseUrl` in `environment.prod.ts` to the BFF's absolute URL and add that UI origin to `CORS_ALLOWED_ORIGINS`.

# To run the Development UI Server

To run the frontend part of our code, we will use the Angular CLI:

    npm start 

The application is visible at port 4200: [http://localhost:4200](http://localhost:4200)

# Testing

Run the Angular unit tests, BFF tests, production build, and Playwright smoke
test independently:

    npm test
    npm run test:bff
    npm run build
    npm run e2e

The E2E smoke test requires the Spring COMPLY API on port 8080 and the Express
BFF on port 9000. Playwright starts or reuses the Angular development server on
port 4200.

If you have just edited a component, let `ng serve` finish rebuilding before
running `npm run e2e`. Starting mid-rebuild fails on unrelated assertions and
looks like a genuine regression. See [End-to-end testing](docs/testing/e2e.md) for setup, scope, and
failure diagnostics. The [documentation index](docs/README.md) links all durable
engineering documentation.



# Project layout

    src/app/companies/          companies list and create form
    src/app/company-detail/     compliance findings investigator
    src/app/services/           CompaniesService, ComplianceService
    src/app/model/              Company, compliance contracts
    server/                     Express BFF
    server/compliance/          rules, engine implementations, profile store
    e2e/                        Playwright smoke test
    docs/                       durable engineering documentation

This repository began as the Angular University "Angular Forms In Depth" course
project. The course scaffolding - lessons, course categories, the login and
address-form demos, and the in-memory `db-data.ts` fixtures - has been removed.
If you are looking for that course, see
[angular-university/angular-forms-course](https://github.com/angular-university/angular-forms-course).
