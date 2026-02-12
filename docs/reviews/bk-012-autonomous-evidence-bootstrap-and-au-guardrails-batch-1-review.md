# Review: BK-012 Autonomous Evidence Bootstrap and AU Guardrails (Batch 1)

## Metadata
- Date: 2026-02-12
- Reviewer: Codex (GPT-5)
- Scope artifact (PR/commit/range): working tree changes for `BK-012` batch 1
- Review phase: `consensus_lock`

## Explore Findings (High-Impact Only, Max 5)
Only include reliability, security, correctness, and major performance issues.

| issue_id | issue_class | severity (`P1|P2|P3`) | confidence (`high|medium|low`) | scope (`in-batch|out-of-scope`) | file:line | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `BK012-01` | reliability | `P1` | `high` | `in-batch` | `scripts/self-host-autonomous-report.js:160` | Autonomous AU evidence lacked deterministic publisher contract and explicit guardrail status aggregation required for objective gating. |
| `BK012-02` | correctness | `P1` | `high` | `in-batch` | `scripts/self-host-agent-audit-report.js:83` | Agent-audit checks had no deterministic published schema contract for AU readiness and required output parsing robustness for colon-bearing check names (for example `test:run`). |
| `BK012-03` | reliability | `P1` | `high` | `in-batch` | `scripts/self-host-maturity.js:460` | `AU-001`/`AU-002` maturity gates required strict published-schema validation and fail-closed readiness checks instead of placeholder/partial logic. |
| `BK012-04` | operability | `P1` | `high` | `in-batch` | `ROADMAP.md:55` | BK-012 process closure required synchronized plan/review/solution/completion/roadmap references and reproducible command evidence for CI-friendly claims. |

## Synthesis (Ranked Batch)
- Selected issue IDs (ordered): `BK012-01`, `BK012-02`, `BK012-03`, `BK012-04`
- Deferred issue IDs:
  - None.
- Batch rationale:
  - BK-012 requires objective autonomous-evidence publication and strict AU gate validation as one bounded reliability/correctness batch, with lock-safe process convergence.

## Implementer Contract (Batch-Limited)
- Implement only selected issue IDs listed above.
- Do not address deferred or newly discovered issues in this batch.

## Verification (Batch-Only)
Verifier must report on selected issue IDs only.
Verifier must not introduce new issue IDs in this phase.

| issue_id | status (`pass|fail`) | Evidence | Follow-up needed |
| --- | --- | --- | --- |
| `BK012-01` | `pass` | Added deterministic autonomous publisher with strict `self_host_autonomous_report.v1` summary/check contract and explicit stability/guardrail/human-free checks (`scripts/self-host-autonomous-report.js:160`, `scripts/self-host-autonomous-report.js:327`, `packages/cli/src/self-host-autonomous-report.test.ts:17`, `docs/metrics/reports/self-host-autonomous-latest.json:2`). | None |
| `BK012-02` | `pass` | Added deterministic `self_host_agent_audit_report.v1` publisher tied to `agent:audit` output contract, including colon-safe check parsing and regression assertion for `test:run` check-name integrity (`scripts/self-host-agent-audit-report.js:83`, `scripts/self-host-agent-audit-report.js:151`, `packages/cli/src/self-host-agent-audit-report.test.ts:17`, `packages/cli/src/self-host-agent-audit-report.test.ts:51`, `docs/metrics/reports/self-host-agent-audit-latest.json:2`). | None |
| `BK012-03` | `pass` | Hardened `self-host:maturity` AU gates to strict published-schema/readiness validation for both autonomous and agent-audit artifacts (`scripts/self-host-maturity.js:460`, `scripts/self-host-maturity.js:537`, `packages/cli/src/self-host-maturity.test.ts:102`). | None |
| `BK012-04` | `pass` | Converged BK-012 process artifacts and roadmap/docs references with full required verification suite passing (`docs/plans/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-plan.md:1`, `docs/roadmap/backlog-bk-012-autonomous-evidence-bootstrap-and-au-guardrails-completion.md:1`, `docs/solutions/autonomous-evidence-bootstrap-and-au-guardrails.md:1`, `ROADMAP.md:30`, `ROADMAP.md:55`, `ROADMAP.md:141`; commands: `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run test:golden`, `npm run self-host:maturity -- --require-level deterministic-local`, `npm run reliability:slo -- --report ./docs/metrics/reports/compound-reliability-slo-latest.json`). | None |

## Consensus Lock
- Decision: `resolved`
- Reopened issue IDs (if any):
  - None.
- Lock rationale:
  - BK-012 selected issues are fully implemented with deterministic autonomous/agent-audit publication contracts, strict AU fail-closed validation, reproducible evidence artifacts, and required verification commands passing in final state.

## Ratchet Rule
No new critique is introduced until the active batch reaches `resolved`.

## Cross References
- Plan: [`docs/plans/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-plan.md`](../plans/bk-012-autonomous-evidence-bootstrap-and-au-guardrails-batch-1-plan.md)
- Solution: [`docs/solutions/autonomous-evidence-bootstrap-and-au-guardrails.md`](../solutions/autonomous-evidence-bootstrap-and-au-guardrails.md)
- Completion report: [`docs/roadmap/backlog-bk-012-autonomous-evidence-bootstrap-and-au-guardrails-completion.md`](../roadmap/backlog-bk-012-autonomous-evidence-bootstrap-and-au-guardrails-completion.md)
