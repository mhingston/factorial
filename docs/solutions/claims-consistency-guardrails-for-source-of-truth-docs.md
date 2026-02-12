---
title: "Claims consistency guardrails for source-of-truth docs"
category: "reliability"
tags:
  - "claims-consistency"
  - "ci-gates"
date: "2026-02-12"
trigger: "BK-013 required fail-closed consistency enforcement across roadmap/spec/companion/maturity declarations."
---

# Problem
Conformance and maturity claims were spread across multiple source-of-truth documents without an automated consistency gate, allowing contradictory declarations to drift into mainline.

# Solution Pattern
Add a deterministic repository-local claims audit command that parses explicit claim anchors and contract rows, publishes a structured report, and is enforced in CI as a fail-closed gate with fixture-backed pass/fail tests.

# Key Insight
Cross-document claims stay reliable when each document exposes machine-parseable anchors and CI treats drift as a blocking correctness failure.

# Implementation References
- Files touched:
  - `scripts/claims-consistency-audit.js`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `docs/companion-spec-scope-contract.md`
  - `ROADMAP.md`
  - `README.md`
  - `tests/fixtures/claims-audit/roadmap.compliant.md`
  - `tests/fixtures/claims-audit/spec-matrix.compliant.md`
  - `tests/fixtures/claims-audit/companion.compliant.md`
  - `tests/fixtures/claims-audit/companion.mismatch-current-level.md`
  - `tests/fixtures/claims-audit/maturity.compliant.md`
  - `packages/cli/src/claims-consistency-audit.test.ts`
- Tests added/updated:
  - `packages/cli/src/claims-consistency-audit.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-013-claims-consistency-guardrails-batch-1-plan.md`
  - `docs/reviews/bk-013-claims-consistency-guardrails-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `claims_consistency_report.v1` validates current/next maturity claims, targeted delta statuses, and unattended-autonomy boundary consistency.
  - Mismatch fixture fails with explicit `CLM-002` evidence when companion current-level wording drifts.
- What validated reliability over time:
  - `npm run claims:audit -- --report ./docs/metrics/reports/claims-consistency-latest.json`
  - `npm run test:run -- packages/cli/src/claims-consistency-audit.test.ts`
  - CI job: `.github/workflows/ci.yml` `claims-consistency`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required for BK-013 batch 1; this adds an issue-scoped guardrail command and CI gate but no new default agent-process pattern.

# Reuse Guidance
- When to apply this pattern:
  - Any repository claim that is declared in multiple docs and must fail closed when declarations diverge.
- When not to apply:
  - Single-source claims that intentionally allow narrative variance without contractual synchronization.
- Known tradeoffs:
  - Claim anchors must be maintained as part of doc edits; removing/renaming anchors causes intentional gate failures.
