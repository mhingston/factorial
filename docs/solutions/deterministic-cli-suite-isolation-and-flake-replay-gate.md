---
title: "Deterministic CLI suite isolation and flake replay gate"
category: "reliability"
tags:
  - "deterministic-verification"
  - "flake-replay"
date: "2026-02-12"
trigger: "BK-010 required deterministic build/test isolation and replay-based flake threshold enforcement for required CLI/self-host suites."
---

# Problem
Parallel verification could mutate shared build outputs and temp/log roots across CLI/self-host suites, making failures nondeterministic and hard to attribute. There was also no objective replay gate to quantify required-suite flakiness before merge.

# Solution Pattern
Introduce a shared deterministic test harness for CLI suite prebuild/isolation, then enforce repeated-suite replay via a versioned report contract and CI threshold gate.

# Key Insight
Determinism improves when build readiness and suite artifact boundaries are centralized and flakiness is evaluated as explicit pass-rate evidence over repeated executions.

# Implementation References
- Files touched:
  - `packages/cli/src/test-harness.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `packages/cli/src/self-host-dogfood.test.ts`
  - `packages/cli/src/self-host-maturity.test.ts`
  - `scripts/self-host-flake-replay.js`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `docs/metrics/reports/self-host-flake-latest.json`
  - `README.md`
  - `ROADMAP.md`
  - `AGENTS.md`
- Tests added/updated:
  - `packages/cli/src/self-host-flake-replay.test.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `packages/cli/src/self-host-dogfood.test.ts`
  - `packages/cli/src/self-host-maturity.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-plan.md`
  - `docs/reviews/bk-010-deterministic-verification-hardening-and-flake-replay-gate-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `self_host_flake_report.v1` is published by `npm run self-host:flake` with per-attempt suite evidence and threshold status.
  - Added regression tests for pass/fail replay-threshold outcomes in `packages/cli/src/self-host-flake-replay.test.ts`.
- What validated reliability over time:
  - `npm run self-host:flake -- --replay-count 2 --min-pass-rate 1 --report ./docs/metrics/reports/self-host-flake-latest.json`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` (`Core Commands` and `Conventions` updated with deterministic flake replay gate guidance)

# Reuse Guidance
- When to apply this pattern:
  - Suites that invoke build + CLI/script execution and can race on shared artifact roots under parallel test runners.
- When not to apply:
  - Pure unit suites that do not touch shared build outputs or filesystem logs.
- Known tradeoffs:
  - Replay gates add CI runtime cost proportional to replay count and required suite count.
