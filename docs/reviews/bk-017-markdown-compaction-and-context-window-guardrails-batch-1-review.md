# Review: BK-017 Markdown Compaction and Context-Window Guardrails (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-017` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK017-01` | reliability | `P1` | `high` | `in-batch` | `scripts/docs-freshness-audit.js:18` | Docs freshness gate lacked direct markdown-size constraints and compaction-asset enforcement to prevent unbounded source-doc growth. |
| `BK017-02` | correctness | `P1` | `high` | `in-batch` | `packages/cli/src/docs-freshness-audit.test.ts:16` | Regression suite lacked checks for size-budget failures and missing compaction assets. |
| `BK017-03` | operability | `P1` | `high` | `in-batch` | `ROADMAP.md:100` | Primary roadmap retained heavy execution-artifact listings inline, increasing prompt/context load for each session. |
| `BK017-04` | process-correctness | `P1` | `high` | `in-batch` | `AGENTS.md:73` | Active execution guidance did not consistently point to a compact handoff artifact for low-context startup. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK017-01`, `BK017-02`, `BK017-03`, `BK017-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-017 requires one bounded compaction/reliability batch that implements deterministic growth limits, validates compaction assets, and reduces default roadmap context size without losing historical traceability.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK017-01` | `pass` | Added size-budget + compaction-asset checks (`DF-005`, `DF-006`) with additive CLI policy args in docs freshness script (`scripts/docs-freshness-audit.js:244`, `scripts/docs-freshness-audit.js:418`). | None |
| `BK017-02` | `pass` | Extended tests/fixtures with budget-fail and missing-asset fail scenarios (`packages/cli/src/docs-freshness-audit.test.ts:16`, `tests/fixtures/docs-freshness/HANDOFF.compliant.md`, `tests/fixtures/docs-freshness/ARCHIVE-README.compliant.md`). `npm run test:run -- packages/cli/src/docs-freshness-audit.test.ts` passed. | None |
| `BK017-03` | `pass` | Added archive index + archived execution-artifact doc and compacted roadmap inline listing to links (`docs/roadmap/archive/README.md:1`, `docs/roadmap/archive/active-execution-artifacts-through-bk-016.md:1`, `ROADMAP.md:100`). | None |
| `BK017-04` | `pass` | Updated AGENTS/README/ROADMAP references to include compact handoff/archive policy and BK-017 closure (`AGENTS.md:54`, `AGENTS.md:74`, `README.md:431`, `ROADMAP.md:41`, `ROADMAP.md:309`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - BK-017 selected issues are implemented and verified with deterministic size/compaction guardrails, fixture-backed regressions, compact roadmap structure, and synchronized process references.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-plan.md`](../plans/bk-017-markdown-compaction-and-context-window-guardrails-batch-1-plan.md)
- Solution: [`docs/solutions/markdown-compaction-and-context-window-guardrails.md`](../solutions/markdown-compaction-and-context-window-guardrails.md)
- Completion report: [`docs/roadmap/backlog-bk-017-markdown-compaction-and-context-window-guardrails-completion.md`](../roadmap/backlog-bk-017-markdown-compaction-and-context-window-guardrails-completion.md)
