---
title: "Provider-backed maturity evidence publication and gate verification"
category: "process"
tags:
  - "self-host"
  - "provider-backed"
date: "2026-02-11"
trigger: "BK-007 required deterministic publication of provider-backed maturity evidence and objective PB gate verification."
---

# Problem
Provider-backed maturity claims depended on transient test execution and lacked a deterministic published evidence artifact that both humans and policy gates could verify.

# Solution Pattern
Create a deterministic evidence publisher command that writes a versioned report contract to a stable repository path, then make maturity gates consume that published contract instead of in-band execution results.

# Key Insight
Promotion gates become auditable when evidence generation and evidence verification are separated into explicit, versioned contracts.

# Implementation References
- Files touched:
  - `scripts/self-host-provider-backed-report.js`
  - `scripts/self-host-maturity.js`
  - `docs/metrics/reports/self-host-provider-backed-latest.json`
  - `docs/self-hosting-maturity-ladder.md`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/cli/src/self-host-provider-backed-report.test.ts`
  - `packages/cli/src/self-host-maturity.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-plan.md`
  - `docs/reviews/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - Published `self_host_provider_backed_report.v1` includes `PB-001`/`PB-002` statuses and `openai`/`anthropic` provider outcomes.
  - `self-host:maturity` PB gates evaluate report schema/status fields and pass from published evidence.
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
  - `npm run self-host:maturity -- --require-level deterministic-local`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not updated; pattern is batch-specific and existing AGENTS defaults already cover self-host maturity gating conventions.

# Reuse Guidance
- When to apply this pattern:
  - Capability claims that need objective promotion evidence and stable verification hooks.
- When not to apply:
  - One-off experiments without persistent maturity/capability declarations.
- Known tradeoffs:
  - Published evidence artifacts must be intentionally regenerated to stay current with contract or test-suite changes.
