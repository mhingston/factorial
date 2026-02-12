---
title: "Weekly compound metrics CLI helper"
category: "process"
tags:
  - "compound"
  - "metrics"
  - "cli"
date: "2026-02-11"
trigger: "BK-003 required an optional helper command for standardized weekly compound reporting."
---

# Problem
Weekly compound metrics reporting was available via a repository script, but it lacked a first-class CLI helper path and a machine-readable payload for automation.

# Solution Pattern
Add an additive CLI command (`factorial compound-weekly`) that:
- accepts explicit date windows (`--start`, optional `--end`),
- derives standardized weekly metrics from git/review artifacts,
- writes deterministic markdown reports,
- optionally emits JSON payload (`compound_weekly_metrics.v1`) for tooling.

# Key Insight
Process metrics helpers are most reusable when they are both human-readable (markdown report) and automation-friendly (stable JSON contract) from the same deterministic inputs.

# Implementation References
- Files touched:
  - `packages/cli/src/index.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `README.md`
  - `docs/metrics/compound-rate.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/e2e-smoke.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-003-weekly-compound-metrics-helper-batch-1-plan.md`
  - `docs/reviews/bk-003-weekly-compound-metrics-helper-batch-1-review.md`

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
  - No `AGENTS.md` update required; existing guidance already includes compound metrics generation as a default convention.

# Reuse Guidance
- When to apply this pattern:
  - Any repository-local process metric that needs both human-readable reporting and CI/tooling integration.
- When not to apply:
  - When metrics require live external systems rather than bounded repository artifacts.
- Known tradeoffs:
  - Output quality depends on review artifact hygiene and consistent lock decision recording.
