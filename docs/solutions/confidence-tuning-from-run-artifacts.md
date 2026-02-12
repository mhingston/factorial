---
title: "Confidence tuning from run artifacts"
category: "reliability"
tags:
  - "confidence-gate"
  - "human-escalation"
  - "deterministic-artifacts"
date: "2026-02-11"
trigger: "BK-002 required threshold/route tuning from observed confidence behavior."
---

# Problem
`confidence.gate` emitted per-run artifacts, but there was no deterministic way to aggregate those artifacts into actionable threshold and escalation-route tuning guidance.

# Solution Pattern
Add a dedicated CLI helper (`factorial confidence-tune`) that scans one or more logs roots for `confidence_result.json`, validates records, and emits deterministic recommendations per node:
- quantile-based recommended threshold for a target escalation rate,
- ranked escalation-target candidates,
- sample sufficiency status (`ready` vs `insufficient_samples`),
- machine-readable report contract (`confidence_tuning_report.v1`).

# Key Insight
Tuning reliability comes from turning historical artifacts into stable control-plane recommendations with explicit sample sufficiency and deterministic ordering.

# Implementation References
- Files touched:
  - `packages/cli/src/index.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `README.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/e2e-smoke.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-002-confidence-escalation-tuning-batch-1-plan.md`
  - `docs/reviews/bk-002-confidence-escalation-tuning-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/cli/src/e2e-smoke.test.ts`
  - `npm run test:run`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - No `AGENTS.md` update required; current guidance already mandates deterministic artifacts and bounded lock-based convergence.

# Reuse Guidance
- When to apply this pattern:
  - Any feature that already emits deterministic per-run artifacts and needs auditable, data-driven policy tuning.
- When not to apply:
  - When decisions require live production telemetry or online learning; this command is bounded to offline artifact analysis.
- Known tradeoffs:
  - Recommendations are only as representative as the provided logs roots and sample volume.
