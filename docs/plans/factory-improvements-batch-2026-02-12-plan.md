# Plan: Factory Improvements Batch 2026-02-12

## Metadata
- Date: 2026-02-12
- Author: OpenCode
- Related issue/PR: N/A
- Risk level: `medium`

## Requirement / Behavior Delta
- Current behavior:
  - DTU scenario classes are limited to existing suites/failure modes with coarse coverage reporting.
  - Evidence freshness checks do not explicitly gate full-autonomy evidence artifacts as a set.
  - Weekly compound metrics omit post-merge maintenance signals already available in unattended telemetry.
- Target behavior:
  - DTU reporting supports expanded scenario classes and failure-mode coverage with explicit class distribution.
  - Full-autonomy evidence freshness is explicit and enforced via evidence freshness checks plus a readiness rollup report.
  - Weekly compound metrics include post-merge maintenance signals (revert/churn) sourced from unattended telemetry.
- Why this change is needed:
  - Improve factory quality signals, prevent stale autonomy claims, and close the loop on post-merge maintenance impact.

## Codebase Research
| Area | Files | Current behavior | Notes |
| --- | --- | --- | --- |
| DTU scenario harness | `packages/core/src/dtu/scenario-harness.ts`, `packages/core/src/dtu/satisfaction-scoring.ts` | Defines suites, failure modes, satisfaction report schema | Extend suites, failure coverage, report fields |
| DTU scenario templates | `packages/core/src/dtu/scenario-curation.ts`, `scripts/scenario-curation.js` | Scenario template validation and TUI for curation | Extend template + failure modes |
| DTU report docs | `docs/dtu-satisfaction-report.md` | Documents report schema | Update when schema changes |
| Evidence freshness | `scripts/evidence-freshness.js`, `.github/workflows/ci.yml`, `.github/workflows/weekly-evidence-refresh.yml` | Evidence freshness report + CI gate | Add FA artifact checks; update reports |
| Full autonomy telemetry | `packages/core/src/dtu/full-autonomy-telemetry.ts`, `scripts/self-host-full-autonomy-telemetry.js` | Produces FA-008 report | Feed rollup readiness |
| Weekly compound metrics | `scripts/compound-weekly-report.js`, `packages/cli/src/index.ts`, `docs/metrics/compound-rate.md` | Weekly metrics from git + review artifacts; cost proxy in script | Extend with maintenance metrics from unattended telemetry |
| Unattended telemetry | `scripts/self-host-unattended-telemetry-report.js`, `docs/metrics/reports/self-host-unattended-telemetry-latest.json` | Includes revert/churn rates | Use as data source |

## External Constraints
- API/provider constraints: None (report-only changes).
- Runtime/environment constraints: Deterministic JSON schemas and CI gating must remain fail-closed.
- Backward compatibility constraints: Keep existing report schema versions or bump explicitly with doc updates.

## Design Outline
- Proposed approach:
  - Add DTU scenario class/failure mode expansion in schema + reporting and update docs.
  - Add full-autonomy readiness rollup report + freshness enforcement for FA artifacts.
  - Extend weekly compound metrics to include maintenance signals from unattended telemetry.
- Rejected alternatives and why:
  - Manual spreadsheet tracking (non-deterministic, not CI-enforced).
  - Using only git data for maintenance (does not capture reverts/churn without telemetry).
- Affected interfaces and contracts:
  - DTU satisfaction report schema.
  - Evidence freshness report inputs.
  - Weekly compound report schema and docs.

## Edge Cases
- Missing unattended telemetry report: weekly metrics should fail closed or report explicit N/A.
- Partial DTU scenario catalogs: new class coverage should surface as 0% coverage.
- Missing FA artifacts: readiness rollup should fail closed with explicit missing list.

## High-Risk Invariants (Required for security, money, data integrity, concurrency)
If not applicable, write `N/A` with reason.

| invariant_id | Invariant | Enforcement approach | Verification step |
| --- | --- | --- | --- |
| N/A | Report-only changes; no runtime execution or data integrity mutation | N/A | N/A |

## Validation Checklist
- [ ] Unit/integration tests updated
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Relevant golden/regression checks pass
- [ ] Documentation updated

## Convergence Setup
- Initial issue batch target IDs:
  - `FI-002` (DTU scenario class/failure coverage expansion)
  - `FI-003` (Full-autonomy freshness + readiness rollup)
  - `FI-004` (Weekly compound maintenance metrics)
- Implementer scope statement (batch-limited): Implement only FI-002, FI-003, FI-004.
- Verifier scope statement (batch-only): Verify FI-002, FI-003, FI-004 only.
- Ratchet acknowledgement: no new critique until active batch is `resolved`.
