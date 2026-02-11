---
title: "PR Compound Gate And Weekly Metrics Reports"
category: "process"
tags:
  - "compound-loop"
  - "ci-gates"
  - "metrics"
date: "2026-02-11"
trigger: "RMD-022 required enforcing Plan/Review/Compound evidence in PR flow and producing reproducible weekly compounding metrics reports."
---

# Problem
Template-only process guidance does not reliably change merge behavior. Without CI enforcement and generated report artifacts, Plan->Review->Compound compliance drifts and weekly metrics remain aspirational.

# Solution Pattern
Pair contributor ergonomics with machine enforcement: require explicit PR body artifact fields and validate them in CI, then generate weekly metrics reports from repository artifacts via script and store them in a fixed docs location.

# Key Insight
Process compounding only becomes durable when the same contract is human-visible in the PR template and machine-validated in CI.

# Implementation References
- Files touched:
  - `.github/pull_request_template.md`
  - `.github/workflows/ci.yml`
  - `scripts/check-pr-compound-artifacts.js`
  - `scripts/compound-weekly-report.js`
  - `docs/metrics/compound-rate.md`
  - `docs/metrics/reports/*.md`
  - `ROADMAP.md`
  - `AGENTS.md`
- Tests added/updated:
  - `tests/fixtures/pr-body/compound-compliant.md`
  - `tests/fixtures/pr-body/compound-missing-lock.md`
- Related plan/review artifacts:
  - Plan: `docs/plans/rmd-022-compound-enforcement-batch-1-plan.md`
  - Review: `docs/reviews/rmd-022-compound-enforcement-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run check:pr-compound -- --body-file tests/fixtures/pr-body/compound-compliant.md`
  - `npm run check:pr-compound -- --body-file tests/fixtures/pr-body/compound-missing-lock.md` (expected fail)
  - `node scripts/compound-weekly-report.js --start 2026-01-19` (and 3 subsequent weekly windows)
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` core commands + conventions now include `check:pr-compound` and weekly report generation guidance.

# Reuse Guidance
- When to apply this pattern:
  - Any repo that requires process artifact compliance at merge time and periodic evidence of process health.
- When not to apply:
  - Extremely small repos where PR templates are intentionally lightweight and no formal review artifact system exists.
- Known tradeoffs:
  - PR body contract changes can cause initial friction until contributors adopt the explicit fields.
