---
title: "Factory Docs Event + Satisfaction Reporting"
category: "process"
tags:
  - "documentation"
  - "telemetry"
date: "2026-02-12"
trigger: "Align software factory docs with scenario satisfaction and event stream visibility"
---

# Problem
Factory-facing documentation mentioned DTU and orchestration but did not describe satisfaction metrics or execution event streams, leaving gaps for operators.

# Solution Pattern
Publish explicit documentation artifacts for scenario satisfaction reports and execution event streams, and link them from the README. Keep scope and provider escape hatch policies documented alongside companion spec claims.

# Key Insight
Operators trust factory claims when the evidence artifacts and telemetry schemas are documented and discoverable at the top level.

# Implementation References
- Files touched: `README.md`, `docs/dtu-satisfaction-report.md`, `docs/execution-event-stream.md`, `docs/companion-spec-scope-contract.md`, `packages/core/src/dtu/dot-generation.ts`
- Tests added/updated: `packages/core/src/dtu/dot-generation.test.ts`
- Related plan/review artifacts: `docs/plans/op-003-factory-improvements-docs-plan.md`, `docs/reviews/op-003-factory-improvements-docs-review.md`

# Validation Evidence
- What validated correctness: `npm run test:run`
- What validated reliability over time: Deterministic doc + schema references for ongoing telemetry use.

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location: N/A

# Reuse Guidance
- When to apply this pattern: When exposing new telemetry outputs or KPI reports to operators.
- When not to apply: Internal-only telemetry that is not part of user-facing workflows.
- Known tradeoffs: Documentation must be kept in sync with evolving schemas.
