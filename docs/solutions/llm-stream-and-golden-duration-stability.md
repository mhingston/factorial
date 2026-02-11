---
title: "LLM stream events and deterministic duration-budget golden"
category: "reliability"
tags:
  - "llm-adapter"
  - "golden-regression"
date: "2026-02-11"
trigger: "RMD-031 batch 2 uncovered stream stub gap and flaky duration-budget golden evidence"
---

# Problem
`RMD-031` required stream-capable adapter behavior, but `LlmAdapter.stream()` was still stubbed. At the same time, a golden regression fixture used an overly tight run-duration budget (`10ms`), which intermittently failed at different nodes under load.

# Solution Pattern
Implement stream as an event-emitting wrapper around the existing adapter completion path (`start` -> payload -> `end` / `error`) and add direct stream tests for API, CLI, and failure behavior. Stabilize duration-based golden fixtures by setting thresholds far enough above framework overhead and ensuring the budget breach is driven by the intended workload step.

# Key Insight
For adapter convergence, a simple deterministic stream event contract is better than a stub, even before token-level streaming is introduced; for timing-sensitive tests, thresholds must target the behavior under test, not runtime noise.

# Implementation References
- Files touched:
  - `packages/core/src/types/index.ts`
  - `packages/core/src/llm/index.ts`
  - `packages/core/src/llm/index.test.ts`
  - `tests/golden/workflows/budget-duration-breach.dot`
  - `tests/golden/expected/budget-duration-breach.json`
- Tests added/updated:
  - `packages/core/src/llm/index.test.ts`
  - `tests/golden/golden-regression.test.ts` (via fixture/expected stabilization)
- Related plan/review artifacts:
  - `docs/plans/rmd-031-provider-adapter-batch-2-plan.md`
  - `docs/reviews/rmd-031-provider-adapter-batch-2-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:run`
  - `npm run test:golden`
- What validated reliability over time:
  - repeated golden execution no longer flips breach node due to startup jitter.

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not updated in this batch; pattern is specific to adapter/fixture convergence and already captured in roadmap and solution docs.

# Reuse Guidance
- When to apply this pattern:
  - When introducing adapter boundaries where a stubbed method blocks convergence criteria.
  - When a golden/assertion includes wall-clock thresholds near baseline execution overhead.
- When not to apply:
  - When strict token-level streaming semantics are required immediately (implement provider-native streaming instead).
- Known tradeoffs:
  - Event-wrapper stream is functional but not token-incremental.
  - Wider timing thresholds reduce sensitivity to micro-regressions.
