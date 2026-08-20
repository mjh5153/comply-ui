# Project documentation

This directory contains durable engineering documentation for Comply UI. Pull
request descriptions and CI artifacts should hold evidence that applies only to
one change or test run.

## Contents

- [End-to-end testing](testing/e2e.md) explains the Playwright smoke suite, its
  real-service boundary, and how to run and diagnose it.
- [CI/CD and deployment](deployment.md) explains the GitHub Actions pipeline,
  why the browser suite needs a real Spring service, and the Render setup.
- [Architecture decisions](adr/README.md) records significant technical choices
  that future contributors may need to revisit.
- [Course-era cleanup](migrations/course-era-cleanup.md) records the removal of
  obsolete training-project guidance and the corrected application model.
- [GitHub CLI setup](setup/github-cli.md) explains macOS installation, SSH
  authentication, verification, and safe handling of device codes.

## Documentation boundaries

Keep stable architecture, setup instructions, and testing conventions here.
Keep exact pass counts, build sizes, temporary data, failed attempts, and other
run-specific evidence in the pull request that produced them. A dated migration
record may preserve explicitly supplied historical evidence when it is labeled
as immutable context rather than a current guarantee.
