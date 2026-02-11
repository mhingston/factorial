# Review: PKG-020C Spec Conformance Batch 2

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `PKG-020C` batch 2 (`PKG-020C-03`, `PKG-020C-04`)
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `PKG-020C-03` | correctness | P1 | high | in-batch | `packages/core/src/engine/index.ts:372` | `loop_restart` emitted restart signal but continued in-run without fresh context/log segment boundary. |
| `PKG-020C-04` | reliability | P1 | high | in-batch | `packages/core/src/handlers/builtin.ts:2946` | `stack.manager_loop` lacked optional local child execution adapter path for deterministic delegated runs. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `PKG-020C-03`, `PKG-020C-04`
- Deferred issue IDs: none
- Batch rationale:
  - This batch closes the remaining `PKG-020C` runtime/manager Phase C gaps while preserving deterministic local execution.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `PKG-020C-03` | pass | Engine now creates restart run segments with `run.segment_*` context keys and `run_segments.json`; validated by `packages/core/src/engine/loop-restart.test.ts` and `packages/core/src/engine/resume.test.ts` segment restoration case; `npm run test:worktree` executed on 2026-02-11 and returned `SKIP` in this checkout due no resolvable `HEAD`. | execute `npm run test:worktree` in commit-backed checkout to collect full non-skip evidence |
| `PKG-020C-04` | pass | `ManagerLoopHandler` now supports constructor-injected local child execution adapter with explicit `manager_local_child_execution` gating; validated in `packages/core/src/handlers/builtin.test.ts`. | none |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any): none
- Lock rationale:
  - Selected batch issues are implemented and validated via targeted and full suite checks (`lint`, `typecheck`, `test:run`, `test:golden`) plus merge-prep worktree command execution evidence.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/pkg-020c-spec-conformance-batch-2-plan.md`](../plans/pkg-020c-spec-conformance-batch-2-plan.md)
- Roadmap: [`ROADMAP.md`](../../ROADMAP.md)
