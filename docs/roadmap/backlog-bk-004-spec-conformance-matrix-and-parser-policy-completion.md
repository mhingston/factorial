# Backlog BK-004 Spec-Conformance Matrix + Parser Policy Closure Completion

Last updated: 2026-02-11

## Scope
- Parent roadmap: [`ROADMAP.md`](../../ROADMAP.md)
- Covers backlog item: `BK-004` (External spec-conformance matrix + parser policy closure)

## Implemented Capabilities
1. Spec-conformance matrix artifact
- Added `docs/spec-conformance-matrix.md` mapping active deltas across:
  - Attractor,
  - coding-agent-loop,
  - unified-llm.
- Each row includes status (`closed|open`), concrete evidence, and follow-up issue ID when applicable.

2. Strict parser policy closure
- Formally documented parser policy:
  - accepted: `digraph`, `strict digraph`,
  - rejected: undirected `graph` mode.
- Aligned references across parser grammar, parser tests, and README policy notes.

3. Roadmap/process convergence
- Updated roadmap status and execution order to mark `BK-004` done and advance to `BK-005`.
- Added batch plan/review/solution cross-links in roadmap active artifacts.

## Validation Evidence
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run test:run` -> PASS
- `npm run test:golden` -> PASS

## Process Artifacts
- Plan: [`docs/plans/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-plan.md`](../plans/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-plan.md)
- Review: [`docs/reviews/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-review.md`](../reviews/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-review.md)
- Solution: [`docs/solutions/spec-conformance-matrix-and-parser-policy-closure.md`](../solutions/spec-conformance-matrix-and-parser-policy-closure.md)

## Exit Criteria
- `docs/spec-conformance-matrix.md` exists and maps active deltas to evidence.
- Parser policy decision (`digraph` strict mode) is explicit and auditable across parser/tests/docs.
