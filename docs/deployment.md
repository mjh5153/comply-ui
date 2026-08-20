# CI/CD and deployment

Continuous integration runs in GitHub Actions. Deployment runs on Render and is
triggered by CI, not by Render's own auto-deploy.

## Pipeline

```text
push / PR to main
   |
   +-- verify   typecheck:bff, test:bff, ng test, production build, build:server
   |
   +-- e2e      build and start Spring, start the BFF, run the browser suite
   |
   v
 deploy         push to main only, needs BOTH jobs
   |
   v
 Render deploy hook
```

`deploy` declares `needs: [verify, e2e]`, so a browser-suite failure blocks the
deploy the same way a unit-test failure does.

## Why the E2E job builds Spring

The browser suite mocks no network route, because the full round trip is the
behavior being verified. That means a real Spring service must exist in CI.
The job checks out `mjh5153/comply-api-blueprint`, builds it with Maven, and
runs the jar on port 8080 before starting the BFF.

`comply-api-blueprint` is public, so no token is required. If it ever becomes
private, the checkout step needs a PAT with read access.

Both services write logs to the runner temp directory and are uploaded as
artifacts when the job fails, alongside the Playwright report and traces.

## Render configuration

`render.yaml` declares the web service. Two details matter and are easy to get
wrong:

**`npm ci --include=dev` is required.** `NODE_ENV=production` is set as a
service environment variable, and Render applies it during the build as well as
at runtime. Without `--include=dev`, npm drops roughly 390 packages including
`@angular/cli` and `typescript`, and the build fails before it starts.

**The BFF runs compiled JavaScript.** `build:server` emits `dist-server/` and
`start:prod` runs `node dist-server/server.js`. Production does not depend on
`ts-node` or on a TypeScript toolchain.

One process serves both the built Angular app and `/api`, so the browser stays
on a single origin and no CORS configuration is needed.

## First-time setup

1. Create the Render service from this repository, either by pointing a Render
   Blueprint at `render.yaml` or by creating a Node web service manually with
   the build and start commands from that file.
2. Set `COMPLY_API_BASE_URL` on the service to the deployed Spring service URL.
   It is marked `sync: false`, so Render will prompt rather than guess.
3. In the Render dashboard, open **Settings -> Deploy Hook** and copy the URL.
4. Add it to this repository as the secret `RENDER_DEPLOY_HOOK_URL`
   (**Settings -> Secrets and variables -> Actions**).

Until that secret exists the `deploy` job succeeds and logs a notice instead of
deploying, so CI is not red before Render is configured.

## Free-tier behaviour

Render's free tier spins a service down when idle. The first request after a
quiet period pays a cold start on both services, which is why
`COMPLY_API_TIMEOUT_MS` is 30s in `render.yaml` rather than the 15s default.
The BFF distinguishes `502` (unreachable) from `504` (timed out) so a cold
start is not reported as an outage.

## What is not covered

- The pipeline does not run the browser suite against the production topology
  (the BFF serving the built app on one origin). It runs against the dev server,
  matching local development. Render's health check on `/api/health` is the only
  production-topology check.
- There is no staging environment. `main` deploys to the single service.
