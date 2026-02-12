# Review: BK-015 Unattended-Run Outcome and Economics Telemetry (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-015` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK015-01` | reliability | `P1` | `high` | `in-batch` | `scripts/self-host-unattended-telemetry-report.js:27` | No deterministic unattended telemetry report contract existed to compute required outcome/economics/maintenance metrics with strict schema validation. |
| `BK015-02` | correctness | `P1` | `high` | `in-batch` | `packages/cli/src/self-host-unattended-telemetry-report.test.ts:16` | No deterministic regression coverage existed for compliant pass plus malformed/missing/stale fail-closed behavior. |
| `BK015-03` | operability | `P1` | `high` | `in-batch` | `.github/workflows/ci.yml:241` | CI did not include a fail-closed unattended telemetry lane validating schema/freshness report publication. |
| `BK015-04` | process-correctness | `P1` | `high` | `in-batch` | `ROADMAP.md:64` | Throughput status references lacked a deterministic telemetry artifact link carrying success/task-mix/economics/churn evidence. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK015-01`, `BK015-02`, `BK015-03`, `BK015-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-015 requires one bounded reliability batch that adds the telemetry contract, fail-closed validation, CI enforcement, and synchronized claim/status references.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK015-01` | `pass` | Added deterministic unattended telemetry publisher with strict source schema/freshness checks, required metric computation, and fail-closed summary (`scripts/self-host-unattended-telemetry-report.js:27`, `scripts/self-host-unattended-telemetry-report.js:180`, `scripts/self-host-unattended-telemetry-report.js:373`, `scripts/self-host-unattended-telemetry-report.js:423`, `docs/metrics/reports/self-host-unattended-telemetry-latest.json:2`). | None |
| `BK015-02` | `pass` | Added deterministic regression coverage for compliant pass, missing-field fail, and stale-source fail behavior (`packages/cli/src/self-host-unattended-telemetry-report.test.ts:16`). `npm run test:run -- packages/cli/src/self-host-unattended-telemetry-report.test.ts` passed. | None |
| `BK015-03` | `pass` | Added CI unattended telemetry lane with fail-closed command execution and artifact upload (`.github/workflows/ci.yml:241`). | None |
| `BK015-04` | `pass` | Updated roadmap/README/agent guidance references to include unattended telemetry artifact/command and completion linkage (`ROADMAP.md:64`, `ROADMAP.md:78`, `README.md:505`, `AGENTS.md:28`, `docs/metrics/compound-rate.md:10`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - BK-015 selected issues are fully implemented with deterministic unattended telemetry publication, fail-closed schema/freshness validation, CI enforcement, and synchronized roadmap/process references.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-plan.md`](../plans/bk-015-unattended-run-outcome-and-economics-telemetry-batch-1-plan.md)
- Solution: [`docs/solutions/unattended-run-outcome-and-economics-telemetry-contract.md`](../solutions/unattended-run-outcome-and-economics-telemetry-contract.md)
- Completion report: [`docs/roadmap/backlog-bk-015-unattended-run-outcome-and-economics-telemetry-completion.md`](../roadmap/backlog-bk-015-unattended-run-outcome-and-economics-telemetry-completion.md)
