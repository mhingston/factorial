---
title: "Provider parity via normalized contract tests"
category: "correctness"
tags:
  - "llm-adapter"
  - "provider-parity"
date: "2026-02-11"
trigger: "RMD-031 exit criteria required explicit >=2-provider parity evidence"
---

# Problem
Multi-provider support existed, but closure depended on explicit proof that equivalent runs produce equivalent normalized outcomes. Provider-specific tests alone did not prove parity.

# Solution Pattern
Add deterministic integration tests that run the same codergen scenario across two providers and compare only normalized fields (`status`, `output_mode`, `output`, normalized `usage`, adapter/backend/operation). Exclude provider-specific metadata from parity assertions.

# Key Insight
Parity should be validated at the normalization boundary, not at raw provider response shape.

# Implementation References
- Files touched:
  - `packages/core/src/handlers/codergen.test.ts`
- Tests added/updated:
  - `normalizes equivalent API outcomes across openai and anthropic providers`
- Related plan/review artifacts:
  - `docs/plans/rmd-031-provider-adapter-batch-3-plan.md`
  - `docs/reviews/rmd-031-provider-adapter-batch-3-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - `AGENTS.md` update deferred; current guidance already requires deterministic provider boundary tests and bounded review lock artifacts.

# Reuse Guidance
- When to apply this pattern:
  - When a roadmap/PR requires cross-provider parity before closure.
- When not to apply:
  - When behavior intentionally differs by provider and divergence is expected/allowed.
- Known tradeoffs:
  - Contract-level parity can miss provider-specific metadata regressions unless separately asserted.
