# Subagent Handoff: RMD-031 Batch 1

## Context
- Date: 2026-02-11
- Parent roadmap item: `RMD-031`
- Milestone: `0.3.x`

## Objective
Create the first provider-aligned LLM adapter boundary so codergen execution is no longer directly coupled to provider calls in handler logic.

## In-Scope Issue IDs
1. `RMD-031A`: define minimal adapter contract (`complete`, `stream` stub allowed).
2. `RMD-031B`: route codergen handler through adapter boundary.
3. `RMD-031C`: extend manifest/provenance mapping for usage/cost/tool metadata.

## Required Files
- `packages/core/src/types/index.ts`
- `packages/core/src/llm/` (new adapter module)
- `packages/core/src/handlers/builtin.ts`
- `packages/core/src/handlers/codergen.test.ts`
- `packages/cli/src/index.ts`
- `packages/cli/src/e2e-smoke.test.ts`
- `tests/golden/workflows/*` and `tests/golden/expected/*` (as needed)
- `README.md`
- `ROADMAP.md`

## Required Outcomes
- Codergen handler uses adapter abstraction, not direct provider SDK selection.
- Manifest/provenance includes stable provider-aligned fields across backends.
- At least one representative workflow can be validated against two providers/backends with normalized outcome parity.

## Validation Commands
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:golden`

## Process Requirements
- Start from `docs/templates/plan.md`.
- Keep implementation and verification bounded by selected issue IDs.
- Produce review artifact from `docs/templates/review.md`.
- Produce solution artifact from `docs/templates/compound.md`.
- Keep ratchet rule: no new critique until active batch is `resolved`.
