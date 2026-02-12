---
title: "Unattended-run outcome and economics telemetry contract"
category: "reliability"
tags:
  - "unattended-telemetry"
  - "economics"
date: "2026-02-12"
trigger: "BK-015 required value-aware unattended throughput evidence beyond PR-volume-only reporting."
---

# Problem
Throughput reporting emphasized volume and lock outcomes without a deterministic contract that combined run success, task distribution, cost proxy, and post-merge maintenance signals.

# Solution Pattern
Publish a dedicated unattended telemetry report contract (`self_host_unattended_telemetry_report.v1`) derived from a versioned source artifact, enforce strict source schema/freshness checks, and fail closed whenever required telemetry fields are missing/invalid/stale.

# Key Insight
Value-aware throughput claims remain deterministic and CI-friendly when raw telemetry inputs are normalized into a strict offline source contract before computing summary economics/maintenance metrics.

# Implementation References
- Files touched:
  - `scripts/self-host-unattended-telemetry-report.js`
  - `packages/cli/src/self-host-unattended-telemetry-report.test.ts`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `docs/metrics/reports/self-host-unattended-telemetry-source-latest.json`
  - `docs/metrics/reports/self-host-unattended-telemetry-latest.json`
  - `docs/metrics/compound-rate.md`
  - `README.md`
  - `ROADMAP.md`
  - `AGENTS.md`
- Tests added/updated:
  - `packages/cli/src/self-host-unattended-telemetry-report.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-plan.md`
  - `docs/reviews/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `self_host_unattended_telemetry_report.v1` includes required metrics/check IDs for success-rate, run-to-merge ratio, task buckets, cost-per-merged-PR proxy, and churn/revert indicators.
  - Regression suite validates compliant pass, missing-field fail, and stale-source fail behavior.
- What validated reliability over time:
  - `npm run self-host:unattended-telemetry -- --source ./docs/metrics/reports/self-host-unattended-telemetry-source-latest.json --report ./docs/metrics/reports/self-host-unattended-telemetry-latest.json`
  - `npm run test:run -- packages/cli/src/self-host-unattended-telemetry-report.test.ts`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run docs:freshness -- --report ./logs/docs_freshness/report.json`

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` core commands/conventions updated for unattended telemetry contract execution scope.

# Reuse Guidance
- When to apply this pattern:
  - When throughput claims need deterministic economics/maintenance context in addition to volume/reliability counts.
- When not to apply:
  - When there is no stable bounded source artifact for run/merge telemetry inputs.
- Known tradeoffs:
  - Cost metrics are proxy-based (token + execution inputs), not direct billing truth, and should be interpreted comparatively rather than as exact spend.
