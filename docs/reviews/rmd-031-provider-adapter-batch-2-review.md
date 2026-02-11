# Review: RMD-031 Provider Adapter Batch 2

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree after `df6cf17`
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `RMD-031D-01` | correctness | `P1` | `high` | `in-batch` | `packages/core/src/llm/index.ts:25` | `LlmAdapter.stream()` was a stub, leaving `RMD-031` stream parity incomplete and blocking closure criteria. |
| `RMD-031D-02` | reliability | `P2` | `high` | `in-batch` | `tests/golden/workflows/budget-duration-breach.dot:5` | Golden regression could fail nondeterministically when `budget_max_duration_ms=10` triggered breach at `start` under load instead of `work`. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered):
  - `RMD-031D-01`
  - `RMD-031D-02`
- Deferred issue IDs:
  - None in this batch.
- Batch rationale:
  - Complete stream-path implementation required by roadmap and remove flaky verification noise to keep CI evidence trustworthy.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `RMD-031D-01` | `pass` | `packages/core/src/llm/index.ts` now emits `llm.stream.start`, payload event (`text`/`object`), and `llm.stream.end` or `llm.stream.error`; tests added in `packages/core/src/llm/index.test.ts` (API + CLI + error paths). | No |
| `RMD-031D-02` | `pass` | `tests/golden/workflows/budget-duration-breach.dot` updated to `budget_max_duration_ms=200` with `sleep 0.3`; expected snapshot updated in `tests/golden/expected/budget-duration-breach.json`; `npm run test:run` and `npm run test:golden` pass. | No |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - Selected fixes are implemented and validated with green lint/typecheck/build/test evidence.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.
