# Plan: BK-015 Unattended-Run Outcome and Economics Telemetry (Batch 1)

## Metadata
- Date: 2026-02-12
- Author: Codex (GPT-5)
- Related issue/PR: `BK-015`
- Risk level: `high`

## Requirement / Behavior Delta
- Current behavior:
  - Throughput-related artifacts focus on volume and lock/reopen reliability signals.
  - There is no deterministic unattended telemetry report contract that includes success-rate, task-mix, economics, and post-merge maintenance outcomes in one machine-validated payload.
  - CI has no dedicated fail-closed lane validating unattended telemetry schema/freshness completeness.
- Target behavior:
  - Add deterministic unattended telemetry report command publishing `self_host_unattended_telemetry_report.v1`.
  - Compute required metrics from bounded repository input artifacts:
    - run success rate (`successful_runs / total_runs`),
    - run-to-merge ratio (`total_runs / merged_prs`),
    - task distribution buckets (`small|medium|large` from changed files/tests/runtime),
    - cost per merged PR (token + execution proxy inputs),
    - post-merge maintenance indicators (revert/churn over bounded windows).
  - Enforce strict source-schema and freshness checks with fail-closed behavior.
  - Add CI lane to publish/validate unattended telemetry artifact.
  - Link telemetry artifact in README/roadmap throughput references.
- Why this change is needed:
  - `BK-015` is the active roadmap execution item and is required to prevent volume-only optimization by forcing value-aware unattended throughput evidence.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| BK-015 scope definition | `ROADMAP.md` | Requires deterministic unattended telemetry report, strict schema/freshness, fail-closed CI lane, and roadmap/status references | Must satisfy all required-scope bullets |
| Existing report/gate conventions | `scripts/reliability-slo-gate.js`, `scripts/claims-consistency-audit.js`, `scripts/self-host-provider-backed-live-report.js` | Versioned schema contracts, explicit check IDs, fail-closed exit semantics, deterministic report paths | Reuse this pattern for unattended telemetry |
| Regression coverage pattern | `packages/cli/src/reliability-slo-gate.test.ts`, `packages/cli/src/claims-consistency-audit.test.ts` | Deterministic pass/fail script tests with temp fixtures and report assertions | Add compliant and malformed/missing-field fail tests |
| CI report lanes | `.github/workflows/ci.yml` | Separate fail-closed jobs for claims/reliability/flake/release with artifact uploads | Add unattended telemetry job in same style |

## External Constraints
- API/provider constraints:
  - None; telemetry must be computed offline from repository inputs/artifacts.
- Runtime/environment constraints:
  - Script and tests must remain deterministic and network-independent.
  - Freshness checks must use explicit bounded thresholds and deterministic date parsing.
- Backward compatibility constraints:
  - No changes to graph execution engine semantics.
  - Existing CI/report jobs and contracts remain additive and intact.

## Design Outline
- Proposed approach:
  - Add `scripts/self-host-unattended-telemetry-report.js`:
    - input: versioned source artifact (`self_host_unattended_telemetry_source.v1`),
    - output: versioned report artifact (`self_host_unattended_telemetry_report.v1`),
    - checks: source-schema validity, freshness compliance, metric completeness,
    - fail-closed: non-zero exit when required fields are missing/invalid/stale.
  - Add npm script `self-host:unattended-telemetry`.
  - Add deterministic test suite `packages/cli/src/self-host-unattended-telemetry-report.test.ts` for pass + malformed/missing-field fail + stale fail behavior.
  - Publish source + latest report artifacts under `docs/metrics/reports/`.
  - Add CI job in `.github/workflows/ci.yml` that runs the command and uploads report artifact.
  - Update `README.md`, `ROADMAP.md`, and process artifacts (review/solution/completion report).
- Rejected alternatives and why:
  - Deriving all inputs dynamically from live SCM/API systems: rejected for determinism/reproducibility and network-independence constraints.
  - Treating telemetry as markdown-only narrative without schema checks: rejected because BK-015 requires machine validation and fail-closed behavior.
- Affected interfaces and contracts:
  - New command: `npm run self-host:unattended-telemetry`.
  - New source schema: `self_host_unattended_telemetry_source.v1`.
  - New report schema: `self_host_unattended_telemetry_report.v1`.
  - New CI lane: unattended telemetry schema/freshness validation job.

## Edge Cases
- Edge case 1:
  - Source artifact exists but has missing required fields or invalid enum/value types.
- Edge case 2:
  - Source artifact schema is valid but stale beyond configured freshness SLA.
- Failure mode handling:
  - Report still publishes deterministic failure details with failed check IDs.
  - Command exits non-zero on any required-check failure.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| BK015-INV-01 | Telemetry claims are machine-verifiable and fail closed on invalid input | Strict source schema check + explicit required fields/types and fail status | malformed/missing-field regression test |
| BK015-INV-02 | Throughput value metrics include required quality/economics/maintenance signals | Deterministic computation of success-rate, run-to-merge ratio, task buckets, cost proxy, churn/revert indicators | compliant fixture regression assertions |
| BK015-INV-03 | Freshness policy is explicit and enforced | Freshness SLA check comparing `generated_at` against bounded threshold | stale-source regression test |
| BK015-INV-04 | CI validates unattended telemetry contract continuously | Dedicated CI job running report command and uploading artifact | workflow job execution path |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `BK015-01` Add deterministic unattended telemetry report command/schema with strict source validation and required metric computation.
  - `BK015-02` Add deterministic regression coverage for compliant pass and malformed/missing/stale fail behavior.
  - `BK015-03` Add CI unattended telemetry lane with fail-closed schema/freshness validation and artifact upload.
  - `BK015-04` Converge README/roadmap/process artifacts and publish latest unattended telemetry references.
- Implementer scope statement (batch-limited):
  - Implement only `BK015-01` through `BK015-04`.
- Verifier scope statement (batch-only):
  - Verify only `BK015-01` through `BK015-04` with pass/fail evidence; do not introduce new issue IDs.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
