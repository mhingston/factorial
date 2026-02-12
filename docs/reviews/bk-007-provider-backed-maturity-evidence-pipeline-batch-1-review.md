# Review: BK-007 Provider-backed Maturity Evidence Pipeline (Batch 1)

## Metadata
- Date: 2026-02-11
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-007` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK007-01` | process-correctness | `P1` | `high` | `in-batch` | `scripts/self-host-provider-backed-report.js:1` | No deterministic publisher existed for `self_host_provider_backed_report.v1` at `docs/metrics/reports/self-host-provider-backed-latest.json`; provider-backed evidence was not reproducibly generated in-repo. |
| `BK007-02` | correctness | `P1` | `high` | `in-batch` | `scripts/self-host-maturity.js:313` | `PB-001` was previously in-band test execution; provider-backed gates were not both objectively verifiable from a published evidence artifact contract. |
| `BK007-03` | reliability | `P2` | `high` | `in-batch` | `packages/cli/src/self-host-provider-backed-report.test.ts:1` | Provider-backed report schema/publication path lacked dedicated regression coverage to prevent contract drift in evidence generation. |
| `BK007-04` | process-correctness | `P2` | `high` | `in-batch` | `ROADMAP.md:45` | Roadmap backlog/status/execution-order references still treated `BK-007` as open and did not include completion/process artifact references for batch closure. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK007-01`, `BK007-02`, `BK007-03`, `BK007-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-007 closure required deterministic publication, objective maturity gate verification, regression protection, and roadmap/process convergence in the same bounded batch.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK007-01` | `pass` | Added deterministic publisher script + npm command (`scripts/self-host-provider-backed-report.js`, `package.json:45`) and published report artifact (`docs/metrics/reports/self-host-provider-backed-latest.json:1`) with schema `self_host_provider_backed_report.v1`. | None |
| `BK007-02` | `pass` | Updated `self-host:maturity` provider-backed gates to evaluate published report contract fields (`scripts/self-host-maturity.js:313`, `scripts/self-host-maturity.js:364`, `scripts/self-host-maturity.js:592`) and maintained deterministic-local required-level gate path. | None |
| `BK007-03` | `pass` | Added regression coverage for publisher and maturity PB verification (`packages/cli/src/self-host-provider-backed-report.test.ts:12`, `packages/cli/src/self-host-maturity.test.ts:18`). | None |
| `BK007-04` | `pass` | Updated BK-007 status/execution order/completion references in roadmap and completion artifact (`ROADMAP.md:45`, `ROADMAP.md:117`, `ROADMAP.md:254`, `docs/roadmap/backlog-bk-007-provider-backed-maturity-evidence-pipeline-completion.md:1`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - Selected issues are implemented with deterministic publication, objective gate verification, passing validation evidence, and roadmap/process closure artifacts.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-plan.md`](../plans/bk-007-provider-backed-maturity-evidence-pipeline-batch-1-plan.md)
- Solution: [`docs/solutions/provider-backed-maturity-evidence-publication-and-gate-verification.md`](../solutions/provider-backed-maturity-evidence-publication-and-gate-verification.md)
- Completion report: [`docs/roadmap/backlog-bk-007-provider-backed-maturity-evidence-pipeline-completion.md`](../roadmap/backlog-bk-007-provider-backed-maturity-evidence-pipeline-completion.md)
