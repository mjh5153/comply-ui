# Project documentation

This directory contains durable engineering documentation for Comply UI. Pull
request descriptions and CI artifacts should hold evidence that applies only to
one change or test run.

## Contents

- [End-to-end testing](testing/e2e.md) explains the Playwright smoke suite, its
  real-service boundary, and how to run and diagnose it.
- [Architecture decisions](adr/README.md) records significant technical choices
  that future contributors may need to revisit.

## Documentation boundaries

Keep stable architecture, setup instructions, and testing conventions here.
Keep exact pass counts, build sizes, temporary data, failed attempts, and other
run-specific evidence in the pull request that produced them.
