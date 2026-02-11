---
title: "DTU Scenario Harness With Failure Catalog"
category: "reliability"
tags:
  - "dtu"
  - "scenario-harness"
  - "failure-simulation"
date: "2026-02-11"
trigger: "RMD-030 completion required deterministic holdout satisfaction reporting and failure-mode simulation coverage."
---

# Problem
Foundational twin contracts alone do not prove DTU readiness. Without a deterministic scenario harness and explicit failure-mode coverage, CI cannot measure satisfaction trends or reliably validate resilience behavior.

# Solution Pattern
Layer a fixture-driven scenario harness on top of contract-validated twins, then enforce a failure catalog with one deterministic scenario per mode. Expose it through a non-interactive CLI command and run it in CI.

# Key Insight
DTU quality is measured at the scenario/report level, not at individual twin API shape alone.

# Implementation References
- Files touched:
  - `packages/core/src/dtu/scenario-harness.ts`
  - `packages/core/src/dtu/reference-runtime.ts`
  - `packages/core/src/dtu/twins/slack-channel.stub.ts`
  - `packages/cli/src/index.ts`
  - `tests/fixtures/dtu/scenarios/*.json`
  - `.github/workflows/ci.yml`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/core/src/dtu/scenario-harness.test.ts`
  - `packages/core/src/dtu/reference-parity.test.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
- Related plan/review artifacts:
  - Plan: `docs/plans/rmd-030-dtu-validation-completion-plan.md`
  - Review: `docs/reviews/rmd-030-dtu-validation-completion-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/core/src/dtu/reference-parity.test.ts packages/core/src/dtu/scenario-harness.test.ts packages/cli/src/e2e-smoke.test.ts`
  - `npm run test:run`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run dtu:run`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - N/A (existing DTU convention already covers contract-first adapter setup)

# Reuse Guidance
- When to apply this pattern:
  - Any integration simulation platform that needs holdout-style confidence reporting and deterministic resilience checks.
- When not to apply:
  - Workloads where live third-party behavior is intentionally required and deterministic replay is not a goal.
- Known tradeoffs:
  - Fixture maintenance overhead increases with twin breadth and failure-mode variants.
