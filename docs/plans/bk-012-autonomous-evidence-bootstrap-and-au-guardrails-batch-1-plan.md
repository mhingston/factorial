# Plan: BK-012 Autonomous Evidence Bootstrap and AU Guardrails (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-012`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - `AU-001` and `AU-002` gates are listed in maturity evaluation, but there is no deterministic autonomous report publisher command and no deterministic published agent-audit report contract.
  - `AU-002` in `scripts/self-host-maturity.js` is a placeholder (`pending`) and does not validate a published evidence artifact.
  - `AU-001` only checks a minimal subset of fields and does not perform strict schema validation.
- Target behavior:
  - Add deterministic autonomous evidence publication command and report schema `self_host_autonomous_report.v1`.
  - Add deterministic agent-audit evidence publication path and report schema `self_host_agent_audit_report.v1` tied to existing `agent:audit` checks.
  - Update `self-host:maturity` AU gates to fail closed on invalid published evidence contracts and require strict schema/summary validation.
  - Add explicit human-free guardrail policy assertions without introducing unattended external-system autonomy claims.
- Why this change is needed:
  - `BK-012` is the active backlog queue head after BK-011 and is required before claims-consistency and live-canary backlog items.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| Maturity AU gate evaluation | `scripts/self-host-maturity.js`, `packages/cli/src/self-host-maturity.test.ts` | `AU-001` checks basic booleans in autonomous report; `AU-002` is placeholder pending and does not validate published report schema | Must move to strict objective evidence validation |
| Existing evidence publication pattern | `scripts/self-host-provider-backed-report.js`, `packages/cli/src/self-host-provider-backed-report.test.ts` | Deterministic publisher command + schema contract + dedicated regression test | Reuse this pattern for autonomous + agent-audit evidence |
| Agent audit command | `scripts/agent-capability-audit.js`, `package.json` (`agent:audit`) | Runs required checks and exits PASS/FAIL, but does not publish schema report artifact | Add deterministic publication path tied to this command |
| Docs and roadmap | `docs/self-hosting-maturity-ladder.md`, `README.md`, `ROADMAP.md` | AU gates documented, but no publication commands/artifact closure references | Converge docs/process artifacts for BK-012 closure |

## External Constraints
- API/provider constraints:
  - No new external provider/network dependency required for autonomous evidence publication.
- Runtime/environment constraints:
  - Keep commands deterministic and CI-friendly.
  - Avoid recursive command execution patterns inside tests.
- Backward compatibility constraints:
  - Preserve existing `npm run agent:audit` behavior and deterministic-local CI floor (`self-host:maturity -- --require-level deterministic-local`).

## Design Outline
- Proposed approach:
  - Add `scripts/self-host-autonomous-report.js` publishing `self_host_autonomous_report.v1` at `docs/metrics/reports/self-host-autonomous-latest.json` with deterministic checks sourced from published reliability/flake/provider-backed evidence and explicit human-free guardrail assertions.
  - Add `scripts/self-host-agent-audit-report.js` publishing `self_host_agent_audit_report.v1` at `docs/metrics/reports/self-host-agent-audit-latest.json`, using `agent:audit` output as evidence input with deterministic parseable summary/check rows.
  - Add npm commands for both publishers and regression tests for pass/fail schema behavior.
  - Update `scripts/self-host-maturity.js` AU gates:
    - `AU-001`: strict autonomous report schema + required summary keys/values.
    - `AU-002`: strict agent-audit report schema + required summary keys/values.
  - Update roadmap/docs/process artifacts for BK-012 completion.
- Rejected alternatives and why:
  - Keeping `AU-002` as placeholder pending command execution: rejected because BK-012 requires objective published evidence.
  - Embedding autonomous evidence generation directly inside `self-host:maturity`: rejected because publication and verification should remain separated with explicit artifact contracts.
- Affected interfaces and contracts:
  - New report schema: `self_host_autonomous_report.v1`.
  - New report schema: `self_host_agent_audit_report.v1`.
  - AU maturity gates consume published artifacts with strict schema checks.

## Edge Cases
- Edge case 1:
  - Required source evidence files are missing when generating autonomous report.
- Edge case 2:
  - Agent audit command exits non-zero or output is partially unparsable.
- Failure mode handling:
  - Report generators still publish deterministic fail-state artifacts with explicit failed check IDs and non-zero exit.
  - Maturity AU gates fail/pending deterministically when artifacts are missing/invalid.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK012-INV-01 | AU gate decisions are objective and artifact-backed | `self-host:maturity` validates published AU report schemas and required pass keys | AU-focused tests + full `test:run` |
| BK012-INV-02 | Autonomous evidence stays policy-bounded (no unattended external autonomy claim) | Explicit human-free guardrail assertions in autonomous report command | Autonomous report tests (pass/fail guardrail scenarios) |
| BK012-INV-03 | Agent-audit publication reflects existing audit checks | Agent-audit report command executes/derives from `agent:audit` output contract | Agent-audit report tests with deterministic command fixtures |
| BK012-INV-04 | Deterministic-local CI floor remains unchanged | Keep required-level gate at deterministic-local and avoid weakening current jobs | `npm run self-host:maturity -- --require-level deterministic-local` |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK012-01` Add deterministic autonomous evidence publisher command/report (`self_host_autonomous_report.v1`) with explicit human-free guardrail checks.
  - `BK012-02` Add deterministic agent-audit evidence publication path/report (`self_host_agent_audit_report.v1`) tied to existing `agent:audit` check output.
  - `BK012-03` Harden `self-host:maturity` AU gate evaluation with strict schema validation for `AU-001`/`AU-002` published artifacts.
  - `BK012-04` Converge tests/docs/roadmap/process artifacts and lock decision for BK-012 batch 1.
- Implementer scope statement (batch-limited):
  - Implement only `BK012-01` through `BK012-04` for BK-012 batch 1.
- Verifier scope statement (batch-only):
  - Verify only `BK012-01` through `BK012-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
