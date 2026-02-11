# Subagent Handoff: PKG-020C Batch 2

## Context
- Date: 2026-02-11
- Parent roadmap item: `RMD-020`
- Parent package slice: `PKG-020C`
- Completed in Batch 1:
  - `PKG-020C-01` `digraph`-only parser enforcement
  - `PKG-020C-02` exactly-one-exit lint enforcement

## In-Scope Issue IDs (Batch 2)
1. `PKG-020C-03`: implement true `loop_restart` run-boundary semantics.
2. `PKG-020C-04`: complete manager loop Phase C local child execution adapter hook.

## Current Gaps
- `packages/core/src/engine/index.ts` currently treats `loop_restart` as in-run continuation and includes a TODO note.
- `packages/core/src/handlers/builtin.ts` manager loop supports delegation artifacts but does not provide an optional local child execution adapter boundary.

## Required Outcomes
- `loop_restart` creates a fresh run segment (new run identity/log segment) instead of plain control-flow jump.
- Manager loop can optionally execute delegated child workflows through an adapter hook without requiring external services.
- Behavior is deterministic, CI-safe, and test-covered.

## Required Files
- Runtime:
  - `packages/core/src/engine/index.ts`
  - `packages/core/src/engine/cancellation.test.ts`
  - `packages/core/src/engine/resume.test.ts`
  - add/update dedicated restart semantics tests as needed
- Manager loop:
  - `packages/core/src/handlers/builtin.ts`
  - `packages/core/src/handlers/builtin.test.ts`
- Docs:
  - `docs/plans/rmd-020-subagent-orchestration-prd.md` (Phase C status)
  - `README.md` (behavior notes)
  - `ROADMAP.md` (status notes)

## Invariants
| invariant_id | Invariant | Required verification |
| --- | --- | --- |
| `PKG020C-INV-03` | `loop_restart` boundaries are explicit and replayable | deterministic unit tests + golden or artifact-level assertion |
| `PKG020C-INV-04` | Child execution adapter cannot introduce nondeterministic external coupling by default | unit tests proving in-memory/local deterministic behavior |

## Validation Commands
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:golden`
- `npm run test:worktree` (from checkout with resolvable `HEAD`)

## Process Requirements
- Start from `docs/templates/plan.md` and create a new batch plan.
- Use `docs/templates/review.md` for structured findings and batch-only verification.
- Produce/update compound artifact from `docs/templates/compound.md`.
- Maintain ratchet rule: no new critique until active batch is `resolved`.

## References
- Batch 1 plan: `docs/plans/pkg-020c-spec-conformance-batch-1-plan.md`
- Batch 1 review: `docs/reviews/pkg-020c-spec-conformance-batch-1-review.md`
- Batch 1 solution: `docs/solutions/spec-conformance-parser-lint-gates.md`
- Existing RMD-020 PRD: `docs/plans/rmd-020-subagent-orchestration-prd.md`
