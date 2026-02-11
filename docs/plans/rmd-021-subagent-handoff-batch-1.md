# Subagent Handoff: RMD-021 Batch 1

## Context
- Date: 2026-02-11
- Parent roadmap item: `RMD-021`
- Priority: P1
- Related roadmap source: `docs/roadmap/0.2-prioritized-issues.md`

## Objective
Close `RMD-021` by verifying and documenting deterministic parity between primary checkout and git worktree execution.

## In-Scope Issue IDs
1. `RMD-021A`: verify `npm run test:worktree` parity path and artifact consistency.
2. `RMD-021B`: tighten docs/CI references for official worktree support and caveats.

## Starting Points
- Existing script: `scripts/worktree-parity-check.js`
- CI/workflow: `.github/workflows/ci.yml`
- Docs likely requiring final polish: `README.md`, `ROADMAP.md`

## Required Outcomes
- Worktree parity check passes in CI and locally from a checkout with resolvable `HEAD`.
- Artifact pathing, checkpoint/resume behavior, and normalized outputs are consistent between root checkout and worktree runs.
- Roadmap and docs include explicit support statement and known caveats.

## Validation Commands
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `npm run test:golden`
- `npm run test:worktree`

## Process Requirements
- Start with a plan from `docs/templates/plan.md`.
- Use `docs/templates/review.md` for batched findings and verification.
- Produce/update solution artifact from `docs/templates/compound.md`.
- Keep ratchet rule: no new critique until active batch is `resolved`.

## References
- Roadmap: `ROADMAP.md`
- Prioritized issues: `docs/roadmap/0.2-prioritized-issues.md`
- Existing 0.2 workstream artifacts:
  - `docs/plans/pkg-020c-spec-conformance-batch-1-plan.md`
  - `docs/plans/pkg-020c-spec-conformance-batch-2-plan.md`
