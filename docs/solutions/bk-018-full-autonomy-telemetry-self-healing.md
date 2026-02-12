---
title: "Full Autonomy Telemetry + Self-Healing Evidence"
category: "reliability"
tags:
  - "telemetry"
  - "self-healing"
date: "2026-02-12"
trigger: "BK-018 FA-008/FA-009 implementation"
---

# Problem
Full-autonomy claims require deterministic evidence for zero-escalation telemetry and self-healing behavior with root-cause traceability.

# Solution Pattern
Define deterministic source schemas and validation reports for telemetry and self-healing. Ensure reports enforce a 30-day window, zero escalations, OOD checks, and root-cause/action coverage across self-healing scenarios. Publish evidence artifacts through scripted commands.

# Key Insight
Treat autonomy evidence as immutable report contracts; validate sources up front and fail closed when required gates are missing.

# Implementation References
- Files touched:
  - `packages/core/src/dtu/full-autonomy-telemetry.ts`
  - `packages/core/src/dtu/self-healing.ts`
  - `scripts/self-host-full-autonomy-telemetry.js`
  - `scripts/self-host-self-healing.js`
- Tests added/updated:
  - `packages/core/src/dtu/full-autonomy-telemetry.test.ts`
  - `packages/core/src/dtu/self-healing.test.ts`
- Related plan/review artifacts:
  - `docs/plans/bk-018-full-autonomy-phase-3-plan.md`
  - `docs/reviews/bk-018-full-autonomy-phase-4-review.md`

# Validation Evidence
- FA-008 report: `docs/metrics/reports/full-autonomy-telemetry-latest.json`
- FA-009 report: `docs/metrics/reports/self-healing-latest.json`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location: `AGENTS.md` (not updated in this batch)

# Reuse Guidance
- When to apply this pattern: When autonomy claims require deterministic telemetry windows and self-healing evidence.
- When not to apply: When evidence can be collected directly from production observability without deterministic contracts.
- Known tradeoffs: Requires maintaining source fixtures and report schemas in-repo.
