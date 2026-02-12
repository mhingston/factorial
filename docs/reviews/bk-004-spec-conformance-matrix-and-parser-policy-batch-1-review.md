# Review: BK-004 Spec-Conformance Matrix + Parser Policy Closure (Batch 1)

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-004` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK004-01` | process-correctness | `P2` | `high` | `in-batch` | `docs/spec-conformance-matrix.md:1` | No dedicated matrix artifact mapped active Attractor/coding-agent-loop/unified-llm deltas to concrete tests and follow-up IDs. |
| `BK004-02` | correctness | `P2` | `high` | `in-batch` | `README.md:168` | Strict parser mode policy (`digraph`/`strict digraph` accepted, `graph` rejected) was implemented but not explicitly declared in primary docs. |
| `BK004-03` | operability | `P2` | `high` | `in-batch` | `ROADMAP.md:300` | Roadmap `BK-004` remained open without closure artifacts and cross-links to a conformance matrix. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK004-01`, `BK004-02`, `BK004-03`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - Close `BK-004` by publishing an auditable conformance matrix, codifying parser policy, and converging roadmap/process artifacts.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK004-01` | `pass` | Added `docs/spec-conformance-matrix.md` with active delta rows across Attractor/coding-agent-loop/unified-llm, explicit status, evidence, and follow-up IDs. | None |
| `BK004-02` | `pass` | README now explicitly declares strict parser policy and links to the matrix (`README.md:168`, `README.md:176`). Parser/test evidence remains in place (`packages/dot-parser/src/dot.pegjs`, `packages/dot-parser/src/parser-wrapper.test.ts`). | None |
| `BK004-03` | `pass` | Roadmap updated to mark `BK-004` done and link batch/completion artifacts (`ROADMAP.md:39`, `ROADMAP.md:300`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - All selected issues were implemented and validated with deterministic documentation/evidence updates.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-plan.md`](../plans/bk-004-spec-conformance-matrix-and-parser-policy-batch-1-plan.md)
- Solution: [`docs/solutions/spec-conformance-matrix-and-parser-policy-closure.md`](../solutions/spec-conformance-matrix-and-parser-policy-closure.md)
- Completion report: [`docs/roadmap/backlog-bk-004-spec-conformance-matrix-and-parser-policy-completion.md`](../roadmap/backlog-bk-004-spec-conformance-matrix-and-parser-policy-completion.md)
