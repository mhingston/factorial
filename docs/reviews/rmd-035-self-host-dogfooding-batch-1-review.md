# Review: RMD-035 Self-hosted Factory Dogfooding Batch 1

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `RMD-035` batch 1 (`RMD-035A-01`, `RMD-035A-02`)
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `RMD-035A-01` | correctness | `P1` | `high` | `in-batch` | `scripts/self-host-dogfood.js:50` | Repository lacked deterministic self-host loop evidence proving lock decision enforcement (`resolved` pass, `reopen` fail) for Plan -> Work -> Review -> Compound orchestration. |
| `RMD-035A-02` | reliability | `P2` | `high` | `in-batch` | `packages/cli/src/self-host-dogfood.test.ts:1` | No automated regression check existed to guard dogfood report shape and pass/fail scenario expectations. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `RMD-035A-01`, `RMD-035A-02`
- Deferred issue IDs:
  - None in this batch.
- Batch rationale:
  - Add minimal deterministic runtime + test coverage to close `RMD-035` without changing core engine behavior.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `RMD-035A-01` | `pass` | `npm run dogfood:self-host` produces `self_host_dogfood_report.v1` with `resolved` scenario exit `0` + manifest `SUCCESS`, and `reopen` scenario non-zero exit + manifest `FAIL`; lock value is carried through manager artifact (`resolved` vs `reopen`). | None |
| `RMD-035A-02` | `pass` | `packages/cli/src/self-host-dogfood.test.ts` validates report schema, scenario counts, expected pass/fail outcomes, and lock values; included in `npm run test:run` suite. | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - Both selected issues are implemented and verified with deterministic command/test evidence in one checkout.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.
