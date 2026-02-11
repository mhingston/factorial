# Review: BK-001 Replay/Provenance UX Improvements (Batch 1)

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-001` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK001-01` | operability | `P2` | `high` | `in-batch` | `packages/cli/src/index.ts:374` | Replay debugging required manual `run_manifest.json` parsing; no first-class CLI summary existed for incident triage. |
| `BK001-02` | correctness | `P2` | `high` | `in-batch` | `packages/cli/src/index.ts:699` | No deterministic command existed to compare replay-critical provenance and status fields between two manifests. |
| `BK001-03` | reliability | `P2` | `high` | `in-batch` | `packages/cli/src/e2e-smoke.test.ts:132` | Existing e2e coverage validated replay success only; it did not guard a manifest debugging UX contract. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK001-01`, `BK001-02`, `BK001-03`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - Deliver a bounded replay/provenance ergonomics slice with deterministic CLI output and regression coverage.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK001-01` | `pass` | New `manifest` CLI command summarizes replay/provenance fields from `run_manifest.json` with deterministic text or JSON output. | None |
| `BK001-02` | `pass` | `manifest --compare` emits replay-focused diff (`graph`, replay profile, node statuses, provenance by node) and equivalence signal. | None |
| `BK001-03` | `pass` | `packages/cli/src/e2e-smoke.test.ts` includes manifest summary/diff JSON assertion for run vs replay manifests; `npm run test:run -- packages/cli/src/e2e-smoke.test.ts` passes. | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - All selected issues are implemented and verified with deterministic command/test evidence.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-001-replay-provenance-ux-batch-1-plan.md`](../plans/bk-001-replay-provenance-ux-batch-1-plan.md)
- Solution: [`docs/solutions/replay-manifest-summary-and-diff.md`](../solutions/replay-manifest-summary-and-diff.md)
- Completion report: [`docs/roadmap/backlog-bk-001-replay-provenance-ux-completion.md`](../roadmap/backlog-bk-001-replay-provenance-ux-completion.md)
