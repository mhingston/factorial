---
title: "LLM Adapter Boundary And Provenance Normalization"
category: "correctness"
tags:
  - "llm-adapter"
  - "codergen"
  - "provenance"
date: "2026-02-11"
trigger: "RMD-031 batch 1 required decoupling codergen provider execution and extending manifest provenance for cross-backend parity analysis."
---

# Problem
When provider SDK/CLI invocation logic lives directly in handler code, orchestration and backend concerns drift together. That coupling makes provider expansion riskier and weakens provenance consistency across backends.

# Solution Pattern
Define a minimal adapter contract in core types and route codergen execution through an adapter module. Keep handler responsibilities focused on orchestration/artifacts/validation, while adapter implementations handle provider-specific complete calls. Emit normalized adapter/operation/output/usage/tooling fields into manifest provenance.

# Key Insight
Provider convergence is safer when backend invocation is an explicit contract and provenance is normalized at the same boundary.

# Implementation References
- Files touched:
  - `packages/core/src/types/index.ts`
  - `packages/core/src/llm/index.ts`
  - `packages/core/src/handlers/builtin.ts`
  - `packages/core/src/index.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
  - `packages/core/src/handlers/codergen.test.ts`
  - `packages/core/src/llm/index.test.ts`
  - `README.md`
  - `ROADMAP.md`
  - `docs/roadmap/0.3-digital-twin-universe-execution-plan.md`
  - `AGENTS.md`
- Tests added/updated:
  - `packages/core/src/llm/index.test.ts`
  - `packages/core/src/handlers/codergen.test.ts`
  - `packages/cli/src/e2e-smoke.test.ts`
- Related plan/review artifacts:
  - Plan: `docs/plans/rmd-031-provider-adapter-batch-1-plan.md`
  - Review: `docs/reviews/rmd-031-provider-adapter-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`
- What validated reliability over time:
  - Adapter boundary is now test-covered in codergen unit tests and represented in CLI smoke manifest provenance checks.

# AGENTS/CLAUDE Update Note
- [x] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` conventions now require codergen/provider work to route through `packages/core/src/llm/` adapter contracts.

# Reuse Guidance
- When to apply this pattern:
  - Any handler flow that currently mixes orchestration logic with provider/backend invocation details.
- When not to apply:
  - One-off local utilities that do not participate in pipeline execution contracts or manifest provenance.
- Known tradeoffs:
  - Adds an abstraction layer that must be kept aligned with provider capabilities as streaming/tooling support expands.
