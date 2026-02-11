---
title: "Loop-Restart Segment Boundary And Manager Local Adapter"
category: "reliability"
tags:
  - "engine"
  - "manager-loop"
  - "restart-boundary"
date: "2026-02-11"
trigger: "PKG-020C Phase C required true loop restart boundaries and deterministic local delegated child execution."
---

# Problem
`loop_restart` without a true run boundary blurs replay/debug semantics and mixes artifacts across restarts. Separately, manager delegation without an optional local execution hook requires manual context injection for deterministic tests.

# Solution Pattern
Treat each restart as a segment boundary: clone context into a new run segment, reset segment-local traversal/runtime state, switch logs root to `<logs_root>/restart-XXX`, and emit explicit restart boundary events/artifacts. For manager loops, add a constructor-injected local child adapter behind an explicit node attribute gate.

# Key Insight
Restart semantics and delegated execution become predictable when both are represented as explicit adapter boundaries instead of implicit control-flow shortcuts.

# Implementation References
- Files touched:
  - `packages/core/src/engine/index.ts`
  - `packages/core/src/engine/loop-restart.test.ts`
  - `packages/core/src/engine/resume.test.ts`
  - `packages/core/src/handlers/builtin.ts`
  - `packages/core/src/handlers/builtin.test.ts`
  - `README.md`
  - `docs/plans/rmd-020-subagent-orchestration-prd.md`
- Tests added/updated:
  - `packages/core/src/engine/loop-restart.test.ts`
  - `packages/core/src/engine/resume.test.ts`
  - `packages/core/src/handlers/builtin.test.ts`
- Related plan/review artifacts:
  - Plan: `docs/plans/pkg-020c-spec-conformance-batch-2-plan.md`
  - Review: `docs/reviews/pkg-020c-spec-conformance-batch-2-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/core/src/engine/loop-restart.test.ts packages/core/src/engine/resume.test.ts packages/core/src/handlers/builtin.test.ts`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required; existing AGENTS guidance already prefers deterministic contracts and adapter boundaries.

# Reuse Guidance
- When to apply this pattern:
  - Any workflow runtime requiring replayable restart semantics and deterministic delegated sub-workflow simulation.
- When not to apply:
  - Purely linear workflows with no restart/delegation semantics.
- Known tradeoffs:
  - Segment artifacts increase log surface area and require explicit cleanup policies in long-running environments.
