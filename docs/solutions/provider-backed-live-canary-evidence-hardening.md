---
title: "Provider-backed live-canary evidence hardening"
category: "reliability"
tags:
  - "provider-backed"
  - "live-canary"
date: "2026-02-12"
trigger: "BK-014 required bounded live-provider evidence publication while preserving deterministic CI floor behavior."
---

# Problem
Provider-backed claim evidence relied on deterministic contract tests only, without a bounded live-provider canary artifact to complement confidence for real-provider paths.

# Solution Pattern
Publish a dedicated bounded live-canary report with explicit provider statuses (`pass|fail|skip`), strict timeout/token limits, advisory-by-default local behavior, and explicit fail-closed policy mode for configured nightly/release lanes.

# Key Insight
Live-provider evidence can be safely introduced without destabilizing deterministic CI by separating advisory collection from explicit fail-closed policy mode.

# Implementation References
- Files touched:
  - `scripts/self-host-provider-backed-live-report.js`
  - `packages/cli/src/self-host-provider-backed-live-report.test.ts`
  - `package.json`
  - `.github/workflows/provider-backed-live-canary.yml`
  - `docs/self-hosting-maturity-ladder.md`
  - `docs/spec-conformance-matrix.md`
  - `README.md`
  - `docs/metrics/reports/self-host-provider-backed-live-latest.json`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/self-host-provider-backed-live-report.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-plan.md`
  - `docs/reviews/bk-014-provider-backed-live-canary-evidence-hardening-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `self_host_provider_backed_live_report.v1` report includes bounded probe settings, required provider statuses, and policy-mode outcome with explicit check IDs.
  - Mock-mode regression covers require-pass pass/fail and advisory skip behavior deterministically.
- What validated reliability over time:
  - `npm run self-host:provider-backed-live -- --report ./docs/metrics/reports/self-host-provider-backed-live-latest.json`
  - `npm run test:run -- packages/cli/src/self-host-provider-backed-live-report.test.ts`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`
  - `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required for BK-014 batch 1; this introduces an issue-scoped evidence lane and does not add a new default agent workflow rule.

# Reuse Guidance
- When to apply this pattern:
  - When deterministic contract-test evidence needs supplemental real-environment signal without forcing always-on fail-closed behavior.
- When not to apply:
  - Systems where provider calls are strictly prohibited or where deterministic-only evidence is the explicit policy.
- Known tradeoffs:
  - Advisory mode can mask live-provider failures unless a configured fail-closed lane is enabled and monitored.
