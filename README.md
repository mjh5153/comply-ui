# Comply UI

Standalone extraction of the Angular application originally located under `demo-backup/React-code`.

## Application

The Angular workspace is located at:

```text
angular-demo/signals-demo-app
```

## Baseline

- Angular 15.x
- NgModule-based bootstrap
- RxJS 7.5
- TypeScript 4.8
- No Angular Signals implementation yet

## Local development

Angular 15 should be run with a compatible Node.js release. Use Node 18 LTS for this baseline.

```bash
nvm install 18
nvm use 18
cd angular-demo/signals-demo-app
npm ci
npm start
```

Then open `http://localhost:4200`.

## Build

```bash
npm run build
```

## Repository status

This directory is intentionally decoupled from the original `demo-backup` repository and has its own Git history on branch `main`.

## Planned Comply API integration

The recommended next architectural step is to modernize this baseline to current Angular before implementing Comply-specific features. The target should use standalone APIs, Signals/Signal Store where state warrants it, Signal Forms for the scan workflow, typed HTTP integration with the Comply API, and agentic UI capabilities behind explicit tool/action boundaries.
