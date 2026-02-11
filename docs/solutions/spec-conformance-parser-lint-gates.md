---
title: "Spec Conformance Through Parser and Lint Gates"
category: "correctness"
tags:
  - "dot-parser"
  - "lint"
  - "invariants"
date: "2026-02-11"
trigger: "PKG-020C required closing Attractor spec deltas before additional orchestration complexity."
---

# Problem
Spec mismatches persist when structural constraints are enforced late or inconsistently. In this case, undirected graph mode and loose exit-node cardinality allowed invalid workflows to pass early checks.

# Solution Pattern
Enforce structural invariants at the earliest deterministic boundary: parser for syntax/graph-mode constraints, lint for topology constraints. Pair each invariant with a focused regression test and then run full-suite verification to ensure no behavior drift.

# Key Insight
Spec conformance is most reliable when each invariant has exactly one enforcement owner and one direct regression test.

# Implementation References
- Files touched:
  - `packages/dot-parser/src/dot.pegjs`
  - `packages/dot-parser/src/parser.js`
  - `packages/dot-parser/src/parser-wrapper.test.ts`
  - `packages/core/src/lint/index.ts`
  - `packages/core/src/lint/index.test.ts`
  - `ROADMAP.md`
- Tests added/updated:
  - `packages/dot-parser/src/parser-wrapper.test.ts`
  - `packages/core/src/lint/index.test.ts`
- Related plan/review artifacts:
  - Plan: `docs/plans/pkg-020c-spec-conformance-batch-1-plan.md`
  - Review: `docs/reviews/pkg-020c-spec-conformance-batch-1-review.md`

# Validation Evidence
- What validated correctness:
  - `npm run test:run -- packages/dot-parser/src/parser-wrapper.test.ts packages/core/src/lint/index.test.ts`
- What validated reliability over time:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:golden`

# AGENTS/CLAUDE Update Note
- [ ] Root agent context updated with this pattern (or rationale if not needed)
- Update location:
  - Not required; this pattern aligns with existing AGENTS guidance on strict contracts and deterministic CI checks.

# Reuse Guidance
- When to apply this pattern:
  - Any roadmap item that closes format/topology conformance gaps with clear parser/lint boundaries.
- When not to apply:
  - Cases where the required behavior is runtime-state-dependent rather than static structure.
- Known tradeoffs:
  - Stricter upfront checks can break previously tolerated workflows and require fixture migration.
