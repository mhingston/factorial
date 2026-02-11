---
title: "DTU Contract-First Runtime Boundary"
category: "reliability"
tags:
  - "dtu"
  - "contracts"
  - "parity-testing"
date: "2026-02-11"
trigger: "RMD-030 Phase A required deterministic twin contracts and replay parity without changing the core execution engine."
---

# Problem
DTU implementation can drift into ad-hoc simulation logic unless request/response contracts, runtime boundaries, and parity fixtures are defined first. That drift makes scenario replay non-deterministic and difficult to validate in CI.

# Solution Pattern
Define strict schema contracts for twin invocation first, then implement a backend-agnostic runtime boundary with an in-memory adapter, then lock behavior with fixture parity replay tests using a reference twin stub.

# Key Insight
Treat twin behavior as a deterministic API contract, not as an internal helper implementation.

# Implementation References
- Files touched:
  - `packages/core/src/dtu/contracts.ts`
  - `packages/core/src/dtu/runtime.ts`
  - `packages/core/src/dtu/twins/jira-issue.stub.ts`
  - `packages/core/src/dtu/index.ts`
  - `packages/core/src/index.ts`
  - `index.ts`
  - `tests/fixtures/dtu/jira-issue/create-issue.success.json`
  - `tests/fixtures/dtu/jira-issue/create-issue.auth-failed.json`
  - `tests/fixtures/dtu/jira-issue/unsupported-operation.error.json`
  - `docs/roadmap/0.3-phase-a-dtu-foundations-vertical-slice.md`
- Tests added/updated:
  - `packages/core/src/dtu/reference-parity.test.ts`
- Related plan/review artifacts:
  - Plan: `docs/plans/rmd-030-phase-a-dtu-foundations-plan.md`
  - Review: `docs/reviews/rmd-030-phase-a-dtu-foundations-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/core/src/dtu/reference-parity.test.ts`
  - `npm run test:run`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` (Conventions section)

# Reuse Guidance
- When to apply this pattern:
  - New integration simulation layers, provider adapters, or runtime boundaries needing deterministic replay.
- When not to apply:
  - One-off throwaway experiments that do not need CI parity or roadmap-level traceability.
- Known tradeoffs:
  - Upfront schema and fixture authoring cost before feature breadth.
