# Review: BK-006 Self-hosting Maturity Ladder and Promotion Gates (Batch 1)

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-006` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK006-01` | process-correctness | `P1` | `high` | `in-batch` | `scripts/self-host-maturity.js:1` | No executable maturity-gate runner existed to evaluate staged self-host levels and emit an auditable status contract. |
| `BK006-02` | operability | `P2` | `high` | `in-batch` | `.github/workflows/ci.yml:1` | CI had no dedicated self-host maturity gate or report artifact publication hook. |
| `BK006-03` | correctness | `P2` | `high` | `in-batch` | `docs/self-hosting-maturity-ladder.md:1` | No formal level declaration (`deterministic-local`/`provider-backed`/`autonomous`) with objective promotion criteria and next-level requirements. |
| `BK006-04` | process-correctness | `P2` | `high` | `in-batch` | `ROADMAP.md:318` | Roadmap/spec claims still treated self-host maturity closure as backlog-open (`BK-006`) and lacked converged closure artifacts. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK006-01`, `BK006-02`, `BK006-03`, `BK006-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - Close the final backlog item by combining executable objective gates, CI/reporting enforcement, and claims/doc convergence.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK006-01` | `pass` | Added `scripts/self-host-maturity.js` + `npm run self-host:maturity` with staged gates (`DL-*`, `PB-*`, `AU-*`) and report schema `self_host_maturity_report.v1`; added regression test `packages/cli/src/self-host-maturity.test.ts`. | None |
| `BK006-02` | `pass` | Added CI job `self-host-maturity` enforcing `--require-level deterministic-local` and uploading report artifacts (`.github/workflows/ci.yml`). | None |
| `BK006-03` | `pass` | Published maturity ladder doc with objective gates, declared current level, and explicit next-level criteria (`docs/self-hosting-maturity-ladder.md`). | None |
| `BK006-04` | `pass` | Updated roadmap/spec/README/AGENTS claims and added BK-006 plan/review/solution/completion artifacts to close backlog item (`ROADMAP.md`, `docs/spec-conformance-matrix.md`, `README.md`, `AGENTS.md`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - Selected issues are implemented with executable gate enforcement, CI/reporting integration, and aligned documentation claims.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-plan.md`](../plans/bk-006-self-hosting-maturity-ladder-and-promotion-gates-batch-1-plan.md)
- Solution: [`docs/solutions/self-hosting-maturity-ladder-and-objective-promotion-gates.md`](../solutions/self-hosting-maturity-ladder-and-objective-promotion-gates.md)
- Completion report: [`docs/roadmap/backlog-bk-006-self-hosting-maturity-ladder-and-promotion-gates-completion.md`](../roadmap/backlog-bk-006-self-hosting-maturity-ladder-and-promotion-gates-completion.md)
