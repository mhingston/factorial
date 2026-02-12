---
title: "Reliability SLO gates with deterministic auto-reopen policy hook"
category: "reliability"
tags:
  - "slo"
  - "compound-metrics"
date: "2026-02-12"
trigger: "BK-009 required objective reliability thresholds and deterministic `resolved|reopen` policy hooks over weekly compound metrics evidence."
---

# Problem
Weekly compound metrics existed, but there was no executable SLO threshold gate that could fail closed and drive a deterministic consensus lock decision when reliability regressed.

# Solution Pattern
Publish a deterministic reliability SLO report from the latest weekly compound metrics artifact, enforce explicit thresholds, and emit a machine-readable policy decision (`resolved|reopen`) for downstream CI/review workflows.

# Key Insight
Reliability governance stays auditable when threshold evaluation and lock-decision policy are published as a single versioned evidence contract.

# Implementation References
- Files touched:
  - `scripts/reliability-slo-gate.js`
  - `docs/metrics/reports/compound-reliability-slo-latest.json`
  - `.github/workflows/ci.yml`
  - `docs/metrics/compound-rate.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/reliability-slo-gate.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-009-reliability-slo-gates-and-auto-reopen-policy-hooks-batch-1-plan.md`
  - `docs/reviews/bk-009-reliability-slo-gates-and-auto-reopen-policy-hooks-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `compound_reliability_slo_report.v1` published with threshold checks `SLO-001..SLO-004` and explicit `consensus_lock_decision`.
  - Fail-closed behavior covered by test when thresholds are violated, forcing `consensus_lock_decision = reopen`.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` (`Core Commands` and `Conventions` updated with reliability SLO command + policy guidance)

# Reuse Guidance
- When to apply this pattern:
  - Any repository workflow that depends on weekly reliability/process signals and needs deterministic reopen automation.
- When not to apply:
  - Flows without stable, versioned reliability artifacts or without lock-based convergence policy.
- Known tradeoffs:
  - Cadence freshness checks can fail when weekly reports are not maintained, intentionally increasing process discipline requirements.
