# Course-era cleanup

- Date: 2026-08-19
- Scope: repository documentation, runtime requirements, and BFF configuration

Comply UI began as an Angular University course project. This cleanup removed
documentation for course scaffolding that no longer exists and documented the
application that is actually present in the repository.

## Removed as dead documentation

- The legacy course-fixture section for `/api/courses`, `/api/lessons`,
  `/api/course-categories`, and `/api/thumbnail-upload`. Those routes and their
  former `server/db-data.ts` and `courses.service.ts` implementations are gone.
- Course branch-checkout instructions that no longer apply to this repository.
- Advertising and links for unrelated Angular University courses.
- References to an `au-input` module and "several separate npm modules," which
  never described this application.

The root README retains one link to the upstream Angular Forms course for
visitors who arrived expecting the original training repository.

## Corrected documentation

- Replaced the broad "Node 22 LTS" requirement with Angular 22's supported Node
  ranges: `^22.22.3`, `^24.15.0`, or `>=26.0.0`.
- Updated `package.json` `engines.node` to enforce that same compatibility
  range instead of accepting unsupported Node 18 installations.
- Described the Express process as a BFF that proxies company operations and
  serves the compliance engine, not as a small generic REST API server.
- Updated the architecture description to distinguish company routes backed by
  Spring persistence from compliance routes currently evaluated inside the
  BFF.
- Removed the `CompaniesService` comparison with deleted course fixtures and
  documented the current company and compliance service boundaries directly.

## Newly documented behavior

- The five locally evaluated compliance-engine paths (six HTTP operations) and
  representative `curl` requests.
- The provenance contract: `engine`, `analyst`, and `ai` information sources,
  plus `fixture` and `live` execution modes.
- The `NOT_APPLICABLE` → `POSSIBLE` → `LIKELY` → `CONFIRMED` applicability
  ladder.
- The `ComplianceEngine` seam and the real `COMPLY_ENGINE_MODE` configuration
  variable used to select its implementation.
- The application stack and project layout.

## Explainer configuration correction

The explanation provider is unconditionally the fixture implementation. A
comment in `server/compliance/index.ts` previously implied that
`COMPLY_EXPLAINER_MODE` was configurable even though no code read such a
variable. The comment now states the real behavior instead of documenting a
nonfunctional configuration knob. Only `COMPLY_ENGINE_MODE` appears in the
configuration table and `.env.example` as a mode selector.

## Historical verification evidence

The cleanup author reported the following results on 2026-08-19:

- all five documented local compliance paths, representing six HTTP operations,
  were registered in `server/server.ts`;
- all README links resolved;
- BFF typechecking and the health check completed successfully; and
- the production build completed at 557.36 kB initial bundle size.

This is immutable evidence supplied with the dated cleanup record, not a claim
about the current worktree or later builds. Current changes must be verified
through CI and the commands in the root README. Exact run results otherwise
belong in their pull request rather than durable operational documentation.

The existing Testing section and `docs/` content were preserved. One operational
note was added: allow `ng serve` to finish rebuilding before starting the E2E
suite, or a mid-build run can produce misleading failures.
